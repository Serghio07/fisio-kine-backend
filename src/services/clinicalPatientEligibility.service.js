const clinicalPatientEligibilityError = (patient) => {
  if (!patient) return { status: 404, message: 'Paciente no encontrado' };
  if (patient.registro_pendiente === true) return { status: 409, message: 'El paciente temporal debe completar su registro antes de acceder a procesos clínicos.' };
  if (patient.estado !== true) return { status: 409, message: 'El paciente está inactivo y no puede utilizarse en un nuevo proceso clínico.' };
  return null;
};

module.exports = { clinicalPatientEligibilityError };
