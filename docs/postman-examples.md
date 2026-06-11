# Ejemplos Postman

Usa este header en todas las rutas protegidas:

```http
Authorization: Bearer TU_TOKEN
```

## POST /api/auth/login

```json
{
  "usuario": "admin",
  "password": "123456"
}
```

## POST /api/usuarios

```json
{
  "nombre": "Administrador",
  "usuario": "admin",
  "email": "admin@physioactive.com",
  "password": "123456",
  "rol": "admin"
}
```

## POST /api/pacientes

```json
{
  "nombres": "Maria",
  "apellidos": "Quispe",
  "ci": "1234567",
  "fecha_nacimiento": "1995-04-12",
  "edad": 31,
  "sexo": "F",
  "telefono": "70000000",
  "domicilio": "La Paz",
  "estado_civil": "Soltera",
  "ocupacion": "Docente",
  "referencia": "Dolor lumbar"
}
```

## POST /api/historias-clinicas

```json
{
  "paciente_id": 1,
  "fecha_evaluacion": "2026-06-10",
  "lugar_fecha_nacimiento": "La Paz, 1995-04-12",
  "peso": 65.5,
  "talla": 1.65,
  "imc": 24.06,
  "diagnostico_medico": "Lumbalgia mecanica",
  "motivo_consulta": "Dolor lumbar",
  "enfermedad_actual": "Dolor desde hace 2 semanas",
  "profesional_cargo": "Lic. Fisioterapeuta",
  "antecedente_personal": {
    "patologicos": false,
    "hospitalarios": false,
    "quirurgicos": false,
    "traumaticos": true,
    "alergicos": false,
    "farmacologicos": false,
    "detalle_traumaticos": "Caida previa",
    "observaciones": "Sin otros antecedentes"
  },
  "antecedente_familiar": {
    "diabetes": false,
    "cancer": false,
    "hipertension": true,
    "cardiovascular": false,
    "asma": false,
    "trombosis_venosa": false,
    "congenitos": false,
    "epilepsia": false,
    "tuberculosis": false,
    "tabaquismo": false,
    "alcoholismo": false,
    "otros": "Madre con hipertension"
  },
  "examen_kinesico": {
    "observacion": "Marcha conservada",
    "inspeccion": "Sin edema",
    "palpacion": "Dolor paravertebral",
    "pruebas_especificas": "Lasague negativo"
  },
  "condicion_actual": {
    "tipo_lesion": "M",
    "zona_cuerpo": "Lumbar",
    "estudios_imagenologicos": "Sin estudios",
    "descripcion": "Dolor moderado al esfuerzo"
  },
  "intervencion_clinica": {
    "escala_dolor": 6,
    "tono": "Aumentado",
    "goniometria_balance_articular": "Limitacion leve",
    "balance_muscular": "4/5",
    "trofismo": "Conservado",
    "detalle_trofismo": "",
    "observaciones": "Iniciar terapia"
  },
  "evaluacion_final": {
    "evaluacion_postura": "Anteversion pelvica leve",
    "evaluacion_marcha": "Funcional",
    "diagnostico_kinesico_cif": "Dolor lumbar con limitacion funcional",
    "plan_tratamiento": "10 sesiones de fisioterapia",
    "periodicidad": "3 veces por semana",
    "profesional_cargo": "Lic. Fisioterapeuta"
  }
}
```
