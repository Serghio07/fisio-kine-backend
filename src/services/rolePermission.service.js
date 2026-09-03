const { RolPermiso } = require('../models');

const ACTIONS = Object.freeze(['view', 'create', 'edit', 'publish', 'annul', 'print', 'export', 'administer']);
const MODULES = Object.freeze(['dashboard','pacientes','historias','evolutivos','agenda','recepcionWhatsapp','monitoreoWhatsapp','sesiones','sesionesSemanales','documentosClinicos','planillasAtencion','informes','actividadesPropias','resumenDiarioClinico','finanzas','usuarios','personalAdministracion','rolesPermisos','sueldos','blogAdministracion','galeria','blogCategorias','auditoria','configuracion']);
const ALL = [...ACTIONS];
const CLINICAL = ['view','create','edit','print','export'];
const PERSONAL_DEFAULTS = Object.freeze({
  dashboard:['view'],pacientes:['view','create','edit','print'],historias:CLINICAL,evolutivos:['view','create','edit'],agenda:ALL,
  recepcionWhatsapp:['view','edit'],monitoreoWhatsapp:[],sesiones:['view','create','edit','print'],sesionesSemanales:['view','create','edit','print','export'],
  documentosClinicos:CLINICAL,planillasAtencion:CLINICAL,informes:CLINICAL,actividadesPropias:['view','create','edit','annul'],
  resumenDiarioClinico:['view','create','edit','print','export'],finanzas:['view','create','edit','print','export'],usuarios:[],personalAdministracion:[],rolesPermisos:[],sueldos:[],
  blogAdministracion:['view','create','edit','publish'],galeria:ALL,blogCategorias:[],auditoria:[],configuracion:[]
});
const ADMIN_DEFAULTS = Object.freeze({
  dashboard:['view'],pacientes:ALL,historias:ALL,evolutivos:['view','create','edit','annul','print','export','administer'],agenda:ALL,
  recepcionWhatsapp:ALL,monitoreoWhatsapp:ALL,sesiones:ALL,sesionesSemanales:ALL,documentosClinicos:ALL,planillasAtencion:ALL,informes:ALL,
  actividadesPropias:ALL,resumenDiarioClinico:['view','create','edit','print','export','administer'],finanzas:ALL,usuarios:ALL,
  personalAdministracion:ALL,rolesPermisos:['view','administer'],sueldos:ALL,blogAdministracion:ALL,galeria:ALL,blogCategorias:ALL,
  auditoria:['view','print','export','administer'],configuracion:ALL
});

const defaultsFor = (role) => Object.fromEntries(MODULES.map((module) => [module, role === 'admin' ? (ADMIN_DEFAULTS[module] || []) : (PERSONAL_DEFAULTS[module] || [])]));
const effectivePermissions = async (role) => {
  const result = defaultsFor(role);
  if (role !== 'personal') return result;
  const rows = await RolPermiso.findAll({ where: { rol: role }, attributes: ['modulo', 'acciones'] });
  rows.forEach((row) => { if (MODULES.includes(row.modulo)) result[row.modulo] = row.acciones.filter((action) => ACTIONS.includes(action)); });
  result.finanzas = [...new Set([...(result.finanzas || []), 'view', 'create', 'edit', 'print', 'export'])];
  return result;
};
const savePermissions = async (role, permissions, userId) => {
  if (role !== 'personal') throw Object.assign(new Error('Los permisos del Administrador están protegidos.'), { status: 400 });
  const entries = Object.entries(permissions || {});
  if (!entries.length || entries.some(([module, actions]) => !MODULES.includes(module) || !Array.isArray(actions) || actions.some((action) => !ACTIONS.includes(action)))) {
    throw Object.assign(new Error('La matriz de permisos contiene valores no válidos.'), { status: 400 });
  }
  await Promise.all(entries.map(([modulo, acciones]) => RolPermiso.upsert({ rol: role, modulo, acciones: [...new Set(acciones)], actualizado_por_id: userId })));
  return effectivePermissions(role);
};

module.exports = { ACTIONS, MODULES, effectivePermissions, savePermissions };
