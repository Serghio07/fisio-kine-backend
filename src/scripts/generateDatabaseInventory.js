const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const sequelize = require('../config/database');

const escapeCell = (value) => String(value ?? '')
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ');

const formatDefault = (value) => value == null ? '—' : `\`${escapeCell(value)}\``;

const generate = async () => {
  try {
    await sequelize.authenticate();

    const [tables] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const [columns] = await sequelize.query(`
      SELECT
        c.table_name,
        c.ordinal_position,
        c.column_name,
        CASE
          WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
          WHEN c.character_maximum_length IS NOT NULL
            THEN c.data_type || '(' || c.character_maximum_length || ')'
          WHEN c.numeric_precision IS NOT NULL AND c.data_type = 'numeric'
            THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
          ELSE c.data_type
        END AS data_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `);
    const [constraints] = await sequelize.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
       AND tc.table_name = kcu.table_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_schema = ccu.constraint_schema
       AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    `);
    const [indexes] = await sequelize.query(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    const counts = {};
    for (const { table_name: tableName } of tables) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) continue;
      const [result] = await sequelize.query(
        `SELECT COUNT(*)::bigint AS count FROM "${tableName}"`
      );
      counts[tableName] = Number(result[0].count);
    }

    const generatedAt = new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'medium'
    }).format(new Date());
    const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const lines = [
      '# Inventario actual de la base de datos',
      '',
      `Generado automáticamente el ${generatedAt} desde PostgreSQL.`,
      '',
      '> Este documento describe la estructura y las cantidades de registros. No incluye nombres, teléfonos, diagnósticos ni otros datos personales o clínicos.',
      '',
      '## Resumen general',
      '',
      `- Esquema: \`public\``,
      `- Tablas: **${tables.length}**`,
      `- Columnas: **${columns.length}**`,
      `- Registros totales contabilizados: **${totalRows}**`,
      `- Integración de WhatsApp: **eliminada**`,
      '',
      '## Tablas y cantidad de registros',
      '',
      '| Tabla | Registros |',
      '|---|---:|',
      ...tables.map(({ table_name: tableName }) =>
        `| \`${tableName}\` | ${counts[tableName] ?? 0} |`
      ),
      '',
      '## Relaciones entre tablas',
      ''
    ];

    const foreignKeys = constraints.filter((item) => item.constraint_type === 'FOREIGN KEY');
    if (foreignKeys.length) {
      lines.push(
        '| Tabla y columna | Referencia | Restricción |',
        '|---|---|---|',
        ...foreignKeys.map((item) =>
          `| \`${item.table_name}.${item.column_name}\` | \`${item.referenced_table}.${item.referenced_column}\` | \`${item.constraint_name}\` |`
        )
      );
    } else {
      lines.push('No existen claves foráneas registradas.');
    }

    lines.push('', '## Detalle completo por tabla', '');

    for (const { table_name: tableName } of tables) {
      const tableColumns = columns.filter((item) => item.table_name === tableName);
      const tableConstraints = constraints.filter((item) => item.table_name === tableName);
      const tableIndexes = indexes.filter((item) => item.table_name === tableName);
      const primaryColumns = new Set(
        tableConstraints
          .filter((item) => item.constraint_type === 'PRIMARY KEY')
          .map((item) => item.column_name)
      );
      const foreignByColumn = new Map(
        tableConstraints
          .filter((item) => item.constraint_type === 'FOREIGN KEY')
          .map((item) => [
            item.column_name,
            `${item.referenced_table}.${item.referenced_column}`
          ])
      );
      const uniqueColumns = new Set(
        tableConstraints
          .filter((item) => item.constraint_type === 'UNIQUE')
          .map((item) => item.column_name)
      );

      lines.push(
        `### \`${tableName}\``,
        '',
        `Registros actuales: **${counts[tableName] ?? 0}**`,
        '',
        '| # | Columna | Tipo | Permite NULL | Predeterminado | Claves |',
        '|---:|---|---|:---:|---|---|'
      );

      tableColumns.forEach((column) => {
        const keys = [];
        if (primaryColumns.has(column.column_name)) keys.push('PK');
        if (uniqueColumns.has(column.column_name)) keys.push('UNIQUE');
        if (foreignByColumn.has(column.column_name)) {
          keys.push(`FK → ${foreignByColumn.get(column.column_name)}`);
        }
        lines.push(
          `| ${column.ordinal_position} | \`${column.column_name}\` | \`${escapeCell(column.data_type)}\` | ${column.is_nullable === 'YES' ? 'Sí' : 'No'} | ${formatDefault(column.column_default)} | ${keys.join(', ') || '—'} |`
        );
      });

      const checks = tableConstraints.filter((item) => item.constraint_type === 'CHECK');
      if (checks.length) {
        lines.push('', 'Restricciones `CHECK`:', '');
        [...new Set(checks.map((item) => item.constraint_name))]
          .forEach((name) => lines.push(`- \`${name}\``));
      }

      if (tableIndexes.length) {
        lines.push('', 'Índices:', '');
        tableIndexes.forEach((index) => {
          lines.push(`- \`${index.index_name}\`: \`${escapeCell(index.definition)}\``);
        });
      }
      lines.push('');
    }

    lines.push(
      '## Observaciones',
      '',
      '- Las cantidades representan el momento en que se generó el documento.',
      '- Los campos calculados por la aplicación, como edad e IMC, pueden también almacenarse en sus columnas correspondientes.',
      '- Las relaciones se obtuvieron de las claves foráneas realmente presentes en PostgreSQL.',
      '- Para actualizar este inventario, ejecuta `node src/scripts/generateDatabaseInventory.js` desde la carpeta `backend`.',
      ''
    );

    const outputPath = path.resolve(__dirname, '../../../docs/INVENTARIO_BASE_DATOS.md');
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
    console.log(`Inventario generado: ${outputPath}`);
    console.log(`Tablas: ${tables.length}; columnas: ${columns.length}; registros: ${totalRows}`);
  } finally {
    await sequelize.close();
  }
};

generate().catch((error) => {
  console.error('No se pudo generar el inventario:', error.message);
  process.exit(1);
});
