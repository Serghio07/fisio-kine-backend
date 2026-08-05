const fs=require('fs');const path=require('path');const sequelize=require('../config/database');
const sql=fs.readFileSync(path.resolve(__dirname,'../../docs/appointment-session-link-up.sql'),'utf8');
sequelize.query(sql).then(()=>console.log('MIGRATION_APPOINTMENT_SESSION_LINKS_OK')).catch((error)=>{console.error(`MIGRATION_ERROR=${error.message}`);process.exitCode=1}).finally(()=>sequelize.close());
