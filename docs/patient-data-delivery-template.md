# Entrega controlada de 10 pacientes e historias

No enviar información por canales inseguros ni guardar datos reales en Git. Antes de cargar: autorización, entorno, formato, responsable clínico, revisor, método manual/importación y backup confirmado.

## Paciente (campos reales)

Obligatorios: `nombres`, `apellidos`, `ci` único, `sexo` (`MASCULINO`/`FEMENINO`), `telefono` y `telefono_normalizado` único (7–15 dígitos). Opcionales: `fecha_nacimiento`, `lugar_nacimiento`, `edad`, `foto`, `peso`, `talla`, `imc`, `domicilio`, `estado_civil`, `ocupacion`, `referencia`, `estado`, `registro_pendiente`.

## Historia clínica (campos reales)

Obligatorios: referencia al paciente (`paciente_id`, se resuelve después de crear/verificar paciente) y `fecha_evaluacion`. Opcionales: `usuario_id`, `lugar_fecha_nacimiento`, `peso`, `talla`, `imc`, `diagnostico_medico`, `motivo_consulta`, `enfermedad_actual`, `profesional_cargo`, `evolutivo`, `estado`. Los campos de anulación/restauración son operativos y no forman parte de una carga inicial.

Entrega recomendada: archivo cifrado fuera del repositorio, una fila por paciente y una por historia, identificador temporal común, diccionario de valores y firma del responsable. Validar duplicados de CI/teléfono y revisar los 10 registros antes de confirmar.
