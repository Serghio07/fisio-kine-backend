const { randomUUID } = require('crypto');
const { Op, fn, col, where } = require('sequelize');
const {
  sequelize,
  ConversacionWhatsapp,
  MensajeWhatsapp,
  Paciente
} = require('../models');
const { normalizedPhone } = require('../config/whatsapp');
const { auditWhatsapp } = require('./whatsappAudit.service');
const { maskPhone, partialMessageId, summarizeText } = require('../utils/whatsapp');

const CONVERSATION_STATES = Object.freeze([
  'ACTIVA', 'FINALIZADA', 'EXPIRADA', 'BLOQUEADA', 'CANCELADA'
]);

const STEPS = Object.freeze({
  WELCOME: 'BIENVENIDA',
  PERSON_SELECTION: 'SELECCION_PERSONA',
  PATIENT_SEARCH: 'BUSQUEDA_PACIENTE',
  PATIENT_SELECTION: 'SELECCION_PACIENTE',
  IDENTITY_VERIFICATION: 'VERIFICACION_IDENTIDAD',
  PATIENT_NOT_FOUND: 'PACIENTE_NO_ENCONTRADO',
  OTHER_NAME: 'OTRA_PERSONA_NOMBRE',
  OTHER_LAST_NAMES: 'OTRA_PERSONA_APELLIDOS',
  OTHER_CI: 'OTRA_PERSONA_CI',
  OTHER_BIRTH_DATE: 'OTRA_PERSONA_FECHA_NACIMIENTO',
  OTHER_RELATION: 'OTRA_PERSONA_RELACION',
  READY_FOR_CARE_TYPE: 'LISTO_PARA_TIPO_ATENCION'
});

const WELCOME_TEXT = `Hola \u{1F44B} Bienvenido a Physio Active.

Te ayudaremos a reservar tu cita.

\u00BFPara qui\u00E9n deseas realizar la reserva?`;

const PERSON_OPTIONS = Object.freeze([
  { id: 'BOOK_FOR_ME', label: 'Para m\u00ED' },
  { id: 'BOOK_FOR_OTHER', label: 'Para otra persona' }
]);

const INVALID_OPTION_TEXT = 'No pude reconocer esa opci\u00F3n. Selecciona una de las opciones disponibles.';
const MAX_MESSAGE_LENGTH = 500;
const MAX_VERIFICATION_ATTEMPTS = 3;

const normalizeOrigin = (origin) => {
  const value = String(origin || '').trim().toUpperCase();
  if (!['WHATSAPP', 'WEB_WHATSAPP'].includes(value)) throw new Error('Origen no valido');
  return {
    requested: value,
    stored: value === 'WEB_WHATSAPP' ? 'WEB' : 'WHATSAPP',
    reference: value === 'WEB_WHATSAPP' ? 'WEB-PHYSIO' : null
  };
};

const validatePhone = (phone) => {
  const normalized = normalizedPhone(phone);
  if (!/^\d{8,15}$/.test(normalized)) throw new Error('Ingresa un numero de telefono valido.');
  return normalized;
};

const validateMessage = (value) => {
  const text = String(value || '').trim();
  if (!text) throw new Error('El mensaje no puede estar vacio.');
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`);
  return text;
};

const protectedPatientName = (patient) => {
  const firstName = String(patient?.nombres || '').trim().split(/\s+/)[0] || 'Paciente';
  const lastInitial = String(patient?.apellidos || '').trim().charAt(0).toLocaleUpperCase('es-BO');
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
};

const phoneCandidates = (phone) => {
  const candidates = new Set([phone]);
  if (phone.startsWith('591') && phone.length > 8) candidates.add(phone.slice(3));
  return [...candidates];
};

const findPatientsByPhone = async (phone, transaction) => {
  const candidates = phoneCandidates(phone);
  return Paciente.findAll({
    where: {
      [Op.or]: [
        { telefono_normalizado: { [Op.in]: candidates } },
        { telefono: { [Op.in]: candidates } },
        where(fn('regexp_replace', col('telefono'), '[^0-9]', '', 'g'), { [Op.in]: candidates })
      ]
    },
    attributes: ['id', 'nombres', 'apellidos', 'ci'],
    order: [['id', 'ASC']],
    transaction
  });
};

const safeTemporaryData = (data = {}) => {
  const safe = { ...data };
  if (safe.otra_persona) {
    safe.otra_persona = {
      ...safe.otra_persona,
      ci: safe.otra_persona.ci ? '[DATO PROTEGIDO]' : undefined
    };
  }
  return safe;
};

const normalizedResponse = (conversation, transition, previousStep) => ({
  texto: transition.text,
  opciones: transition.options || [],
  pasoAnterior: previousStep,
  pasoNuevo: transition.step,
  conversacionId: conversation.id,
  datosTemporales: safeTemporaryData(transition.data),
  accionRealizada: transition.action,
  error: transition.error || null
});

const invalidTransition = (step, data, options = []) => ({
  text: INVALID_OPTION_TEXT,
  options,
  step,
  data,
  action: 'OPCION_INVALIDA',
  error: 'INVALID_TRANSITION'
});

const patientVerificationTransition = (patient, data) => ({
  text: `${protectedPatientName(patient)}, ingresa los ultimos 4 digitos de tu carnet de identidad.`,
  options: [],
  step: STEPS.IDENTITY_VERIFICATION,
  data: { ...data, pacientes_candidatos: [patient.id], paciente_nombre_protegido: protectedPatientName(patient) },
  action: 'SOLICITAR_VERIFICACION_IDENTIDAD'
});

const transitionForMessage = async (conversation, content, transaction) => {
  const step = conversation.ultimo_paso || STEPS.WELCOME;
  const data = { ...(conversation.datos_temporales || {}) };
  const action = content.trim().toUpperCase();

  if ([STEPS.WELCOME, STEPS.PERSON_SELECTION].includes(step)) {
    if (action === 'BOOK_FOR_OTHER') {
      return {
        text: 'Indica el nombre de la persona para quien deseas reservar.',
        options: [],
        step: STEPS.OTHER_NAME,
        data: { tipo_reserva: 'PARA_OTRA_PERSONA', otra_persona: {} },
        action: 'SELECCIONAR_OTRA_PERSONA'
      };
    }
    if (action !== 'BOOK_FOR_ME') return invalidTransition(STEPS.PERSON_SELECTION, data, PERSON_OPTIONS);

    const patients = await findPatientsByPhone(conversation.telefono, transaction);
    const baseData = { tipo_reserva: 'PARA_MI', pacientes_candidatos: patients.map((patient) => patient.id) };
    if (!patients.length) {
      return {
        text: 'No encontramos un paciente asociado a este numero. En esta etapa no se crearan pacientes nuevos.',
        options: [{ id: 'BOOK_FOR_OTHER', label: 'Reservar para otra persona' }],
        step: STEPS.PATIENT_NOT_FOUND,
        data: baseData,
        action: 'PACIENTE_NO_ENCONTRADO'
      };
    }
    if (patients.length === 1) return patientVerificationTransition(patients[0], baseData);
    return {
      text: 'Encontramos mas de un paciente. Selecciona a quien corresponde la reserva.',
      options: patients.map((patient) => ({
        id: `SELECT_PATIENT:${patient.id}`,
        label: protectedPatientName(patient)
      })),
      step: STEPS.PATIENT_SELECTION,
      data: baseData,
      action: 'SOLICITAR_SELECCION_PACIENTE'
    };
  }

  if (step === STEPS.PATIENT_NOT_FOUND) {
    if (action === 'BOOK_FOR_OTHER') {
      return {
        text: 'Indica el nombre de la persona para quien deseas reservar.',
        options: [],
        step: STEPS.OTHER_NAME,
        data: { tipo_reserva: 'PARA_OTRA_PERSONA', otra_persona: {} },
        action: 'SELECCIONAR_OTRA_PERSONA'
      };
    }
    return invalidTransition(step, data, [{ id: 'BOOK_FOR_OTHER', label: 'Reservar para otra persona' }]);
  }

  if (step === STEPS.PATIENT_SELECTION) {
    const selectedId = Number(content.match(/^SELECT_PATIENT:(\d+)$/i)?.[1]);
    if (!selectedId || !(data.pacientes_candidatos || []).includes(selectedId)) {
      const patients = await Paciente.findAll({
        where: { id: { [Op.in]: data.pacientes_candidatos || [] } },
        attributes: ['id', 'nombres', 'apellidos']
      });
      return invalidTransition(step, data, patients.map((patient) => ({
        id: `SELECT_PATIENT:${patient.id}`,
        label: protectedPatientName(patient)
      })));
    }
    const patient = await Paciente.findByPk(selectedId, {
      attributes: ['id', 'nombres', 'apellidos'],
      transaction
    });
    return patientVerificationTransition(patient, data);
  }

  if (step === STEPS.IDENTITY_VERIFICATION) {
    if (!/^\d{4}$/.test(content)) {
      return {
        text: 'Ingresa exactamente los ultimos 4 digitos de tu carnet.',
        options: [],
        step,
        data,
        action: 'FORMATO_VERIFICACION_INVALIDO',
        error: 'INVALID_ID_SUFFIX'
      };
    }
    const patientId = Number(data.pacientes_candidatos?.[0]);
    const patient = await Paciente.findByPk(patientId, {
      attributes: ['id', 'nombres', 'apellidos', 'ci'],
      transaction
    });
    const expected = String(patient?.ci || '').replace(/\D/g, '').slice(-4);
    if (expected && expected === content) {
      return {
        text: 'Identidad verificada. En la siguiente etapa podras seleccionar el tipo de atencion.',
        options: [],
        step: STEPS.READY_FOR_CARE_TYPE,
        data: { ...data, paciente_id: patient.id, paciente_verificado: true },
        patientId: patient.id,
        action: 'IDENTIDAD_VERIFICADA'
      };
    }
    const attempts = Number(conversation.intentos_verificacion || 0) + 1;
    const blocked = attempts >= MAX_VERIFICATION_ATTEMPTS;
    return {
      text: blocked
        ? 'Se alcanzo el limite de intentos. La conversacion fue bloqueada para proteger tus datos.'
        : `Los digitos no coinciden. Te quedan ${MAX_VERIFICATION_ATTEMPTS - attempts} intentos.`,
      options: [],
      step,
      data: { ...data, paciente_verificado: false },
      attempts,
      state: blocked ? 'BLOQUEADA' : 'ACTIVA',
      action: blocked ? 'CONVERSACION_BLOQUEADA' : 'VERIFICACION_FALLIDA',
      error: 'IDENTITY_MISMATCH'
    };
  }

  if (step === STEPS.OTHER_NAME) {
    if (!/^[\p{L}' -]{2,100}$/u.test(content)) {
      return { ...invalidTransition(step, data), text: 'Ingresa un nombre valido usando solamente letras.' };
    }
    return {
      text: 'Ahora escribe sus apellidos.',
      options: [],
      step: STEPS.OTHER_LAST_NAMES,
      data: { ...data, otra_persona: { ...(data.otra_persona || {}), nombres: content } },
      action: 'CAPTURAR_OTRA_PERSONA_NOMBRE'
    };
  }

  if (step === STEPS.OTHER_LAST_NAMES) {
    if (!/^[\p{L}' -]{2,150}$/u.test(content)) {
      return { ...invalidTransition(step, data), text: 'Ingresa apellidos validos usando solamente letras.' };
    }
    return {
      text: 'Ingresa su numero de carnet de identidad.',
      options: [],
      step: STEPS.OTHER_CI,
      data: { ...data, otra_persona: { ...data.otra_persona, apellidos: content } },
      action: 'CAPTURAR_OTRA_PERSONA_APELLIDOS'
    };
  }

  if (step === STEPS.OTHER_CI) {
    if (!/^\d{5,15}$/.test(content)) {
      return { ...invalidTransition(step, data), text: 'Ingresa un carnet valido utilizando solamente numeros.' };
    }
    return {
      text: 'Ingresa su fecha de nacimiento en formato AAAA-MM-DD.',
      options: [],
      step: STEPS.OTHER_BIRTH_DATE,
      data: { ...data, otra_persona: { ...data.otra_persona, ci: content } },
      action: 'CAPTURAR_OTRA_PERSONA_CI'
    };
  }

  if (step === STEPS.OTHER_BIRTH_DATE) {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(content)
      && !Number.isNaN(new Date(`${content}T12:00:00`).getTime())
      && content <= new Date().toISOString().slice(0, 10);
    if (!validDate) {
      return { ...invalidTransition(step, data), text: 'Ingresa una fecha valida en formato AAAA-MM-DD.' };
    }
    return {
      text: '¿Que relacion tienes con la persona para quien reservas?',
      options: [],
      step: STEPS.OTHER_RELATION,
      data: { ...data, otra_persona: { ...data.otra_persona, fecha_nacimiento: content } },
      action: 'CAPTURAR_OTRA_PERSONA_FECHA_NACIMIENTO'
    };
  }

  if (step === STEPS.OTHER_RELATION) {
    if (content.length < 2 || content.length > 80) {
      return { ...invalidTransition(step, data), text: 'Describe la relacion utilizando entre 2 y 80 caracteres.' };
    }
    return {
      text: 'Datos temporales completos. En la siguiente etapa se revisara el registro del paciente.',
      options: [],
      step: STEPS.READY_FOR_CARE_TYPE,
      data: { ...data, otra_persona: { ...data.otra_persona, relacion: content } },
      action: 'OTRA_PERSONA_DATOS_COMPLETOS'
    };
  }

  return invalidTransition(step, data);
};

const createOutgoingMessage = (conversationId, text, transaction) => MensajeWhatsapp.create({
  conversacion_id: conversationId,
  message_id_externo: `sim-out-${randomUUID()}`,
  direccion: 'SALIENTE',
  tipo: 'text',
  contenido_resumido: summarizeText(text),
  estado_envio: 'ENVIADO',
  fecha_envio: new Date(),
  respuesta_api_resumida: { provider: 'SIMULATOR', success: true }
}, { transaction });

const startConversation = async ({ telefono, origen }) => {
  const phone = validatePhone(telefono);
  const origin = normalizeOrigin(origen);
  let conversation;
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
      replacements: { key: `simulator:${phone}` },
      transaction
    });
    conversation = await ConversacionWhatsapp.findOne({
      where: { telefono: phone, estado: 'ACTIVA' },
      order: [['fecha_ultima_interaccion', 'DESC']],
      transaction
    });
    const values = {
      origen_conversacion: origin.stored,
      referencia_origen: origin.reference,
      estado_flujo: 'ACTIVA',
      ultimo_paso: STEPS.PERSON_SELECTION,
      datos_temporales: {},
      intentos_verificacion: 0,
      fecha_ultima_interaccion: new Date(),
      estado: 'ACTIVA'
    };
    if (conversation) await conversation.update(values, { transaction });
    else {
      conversation = await ConversacionWhatsapp.create({
        telefono: phone,
        fecha_inicio: new Date(),
        ...values
      }, { transaction });
    }
    await createOutgoingMessage(conversation.id, WELCOME_TEXT, transaction);
  });
  await auditWhatsapp({
    conversationId: conversation.id,
    action: 'SIMULADOR_INICIADO',
    channel: origin.requested,
    process: 'CONVERSACION',
    result: 'CREADA',
    phone,
    data: { paso_nuevo: STEPS.PERSON_SELECTION }
  });
  return normalizedResponse(conversation, {
    text: WELCOME_TEXT,
    options: PERSON_OPTIONS,
    step: STEPS.PERSON_SELECTION,
    data: {},
    action: 'INICIAR_CONVERSACION'
  }, STEPS.WELCOME);
};

const processConversationMessage = async ({
  messageId,
  telefono,
  contenido,
  tipo = 'text',
  origen = 'WHATSAPP',
  fecha = new Date(),
  conversacionId
}) => {
  const externalId = String(messageId || '').trim().slice(0, 255);
  if (!externalId) throw new Error('messageId es obligatorio.');
  const phone = validatePhone(telefono);
  const content = validateMessage(contenido);
  const origin = normalizeOrigin(origen);

  const existing = await MensajeWhatsapp.findOne({ where: { message_id_externo: externalId } });
  if (existing) {
    await auditWhatsapp({
      conversationId: existing.conversacion_id,
      action: 'MENSAJE_DUPLICADO',
      channel: origin.requested,
      process: 'IDEMPOTENCIA',
      messageId: externalId,
      result: 'IGNORADO',
      phone
    });
    return {
      duplicado: true,
      conversacionId: existing.conversacion_id,
      accionRealizada: 'DUPLICADO_IGNORADO',
      error: null
    };
  }

  let response;
  let outgoing;
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
      replacements: { key: `conversation:${conversacionId}` },
      transaction
    });
    const conversation = await ConversacionWhatsapp.findByPk(conversacionId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!conversation || conversation.telefono !== phone) throw new Error('Conversacion no encontrada.');
    if (conversation.estado !== 'ACTIVA') throw new Error('La conversacion no esta activa.');
    const duplicate = await MensajeWhatsapp.findOne({
      where: { message_id_externo: externalId },
      transaction
    });
    if (duplicate) {
      response = { duplicado: true, conversacionId: conversation.id, accionRealizada: 'DUPLICADO_IGNORADO' };
      return;
    }

    const previousStep = conversation.ultimo_paso;
    const transition = await transitionForMessage(conversation, content, transaction);
    let protectedContent = summarizeText(content);
    if ([STEPS.IDENTITY_VERIFICATION, STEPS.OTHER_CI].includes(previousStep)) {
      protectedContent = '[DATO PROTEGIDO]';
    } else if ([STEPS.WELCOME, STEPS.PERSON_SELECTION, STEPS.PATIENT_NOT_FOUND].includes(previousStep)) {
      protectedContent = PERSON_OPTIONS.find((option) => option.id === content)?.label || protectedContent;
    } else if (previousStep === STEPS.PATIENT_SELECTION && !transition.error) {
      protectedContent = transition.data.paciente_nombre_protegido || 'Paciente seleccionado';
    }
    await MensajeWhatsapp.create({
      conversacion_id: conversation.id,
      message_id_externo: externalId,
      direccion: 'ENTRANTE',
      tipo: String(tipo || 'text').slice(0, 40),
      contenido_resumido: protectedContent,
      estado_envio: 'RECIBIDO',
      fecha_recepcion: fecha
    }, { transaction });

    await conversation.update({
      ultimo_paso: transition.step,
      estado_flujo: transition.step,
      datos_temporales: transition.data,
      paciente_id: transition.patientId || conversation.paciente_id,
      intentos_verificacion: transition.attempts ?? conversation.intentos_verificacion,
      estado: transition.state || conversation.estado,
      fecha_ultima_interaccion: new Date()
    }, { transaction });
    outgoing = await createOutgoingMessage(conversation.id, transition.text, transaction);
    response = normalizedResponse(conversation, transition, previousStep);
  });

  if (response?.duplicado) return response;
  await auditWhatsapp({
    conversationId: response.conversacionId,
    action: response.accionRealizada,
    channel: origin.requested,
    previousState: response.pasoAnterior,
    newState: response.pasoNuevo,
    process: 'MOTOR_CONVERSACION',
    messageId: externalId,
    result: response.error ? 'VALIDACION' : 'PROCESADO',
    phone,
    data: {
      mensaje_salida_parcial: partialMessageId(outgoing?.message_id_externo),
      paso_anterior: response.pasoAnterior,
      paso_nuevo: response.pasoNuevo
    }
  });
  return { ...response, duplicado: false };
};

const resetConversation = async ({ conversacionId, telefono, origen }) => {
  const phone = validatePhone(telefono);
  const conversation = await ConversacionWhatsapp.findByPk(conversacionId);
  if (!conversation || conversation.telefono !== phone) throw new Error('Conversacion no encontrada.');
  await conversation.update({
    estado: 'FINALIZADA',
    estado_flujo: 'FINALIZADA',
    datos_temporales: {},
    fecha_ultima_interaccion: new Date()
  });
  await auditWhatsapp({
    conversationId: conversation.id,
    action: 'SIMULADOR_REINICIADO',
    channel: origen,
    previousState: 'ACTIVA',
    newState: 'FINALIZADA',
    process: 'CONVERSACION',
    result: 'FINALIZADA',
    phone
  });
  return startConversation({ telefono: phone, origen });
};

module.exports = {
  CONVERSATION_STATES,
  STEPS,
  PERSON_OPTIONS,
  WELCOME_TEXT,
  INVALID_OPTION_TEXT,
  protectedPatientName,
  safeTemporaryData,
  startConversation,
  processConversationMessage,
  resetConversation
};
