module.exports = `Conocimiento funcional de Physio Active:
- Panel principal: resume actividad diaria y ofrece accesos a los módulos permitidos.
- Pacientes: registra, busca, consulta y edita pacientes. Conviene buscar por documento antes de crear para evitar duplicados. La ficha conecta historias, citas, sesiones, documentos y resumen.
- Historias clínicas: documentan evaluación, antecedentes, examen, diagnóstico registrado, plan y cantidad de sesiones. Una historia activa permite programar y registrar atenciones; anular conserva el historial.
- Agenda / Citas: organiza fecha y horario. Sus estados incluyen Pendiente, Programada, Confirmada, Atendida, Cancelada, Reprogramada, No asistió y Faltó. Una cita no sustituye la sesión clínica.
- Sesiones: registran la atención real, asistencia, procedimiento, evolución, dolor, técnicas, medios físicos, profesional, fármacos y, para ADMIN, información de cobro. Las sesiones anuladas no cuentan en progreso.
- Evolutivos: muestran el seguimiento clínico vinculado a una historia y sesión. El asistente explica su uso, pero no interpreta clínicamente datos de un paciente.
- Sesiones semanales: consolidan sesiones reales por período y permiten recalcular y exportar según el rol.
- Documentos clínicos: incluyen consentimiento informado, signos vitales, administración de fármacos e informes; permiten crear, consultar, editar, imprimir o descargar según permisos.
- Planillas de atención: consolidan atenciones y sesiones en documentos imprimibles y exportables.
- Control financiero (ADMIN y PERSONAL): conceptos de cobro representan lo esperado; movimientos de pago representan dinero recibido; saldo es esperado menos pagos activos. Los pagos registrados por el personal en Sesiones se sincronizan con la planilla financiera y son visibles para ambos roles. Anular operaciones, reabrir arqueos y administrar cierres permanece reservado al ADMIN.
- Arqueos: comparan importes del sistema con importes confirmados por método (Efectivo, QR, Transferencia, Tarjeta y Otro), registran diferencias, retiro y saldo dejado en caja.
- Resumen diario: consolida actividad clínica y operativa de una fecha; la información financiera depende del rol.
- Actividades: permite al usuario gestionar tareas propias y sus estados.
- Notificaciones: contiene avisos internos y referencias a registros relacionados.
- Recepción WhatsApp: gestiona solicitudes derivadas, asignación, observaciones, resolución y cierre. Monitoreo WhatsApp es administrativo.
- Usuarios, personal, roles y permisos (ADMIN): gestionan cuentas, fichas del personal y accesos por rol.
- Planillas de sueldos (ADMIN): gestionan borradores, detalles del personal, cierre, reapertura, impresión y exportación.
- Blog: administra borradores, artículos, vista previa, publicación y categorías según permisos.

Relaciones esenciales:
- Paciente -> historia clínica -> programación/cita -> sesión real -> evolución/documentos.
- Sesión -> concepto de cobro -> movimiento de pago -> recibo/comprobante -> arqueo.
- Los datos reales solo pueden afirmarse cuando vienen en el contexto o en una herramienta autorizada. Si no están disponibles, explica dónde consultarlos sin inventar cifras ni registros.`;
