require('dotenv').config();
const { BlogPost, BlogCategory, Usuario, sequelize } = require('../models');
const { sanitizeBlogHtml, readingTime } = require('../utils/blog');

const samples = [
  {
    titulo: 'Beneficios de la fisioterapia en la recuperación de lesiones',
    slug: 'beneficios-fisioterapia-recuperacion-lesiones',
    resumen: 'Descubre cómo un tratamiento fisioterapéutico personalizado ayuda a recuperar movilidad, fuerza y confianza después de una lesión.',
    category: 'rehabilitacion',
    image: '/uploads/blog/rehabilitacion-equilibrio.png',
    alt: 'Fisioterapeuta guiando un ejercicio de equilibrio durante la rehabilitación',
    content: '<h2>Una recuperación guiada y progresiva</h2><p>La fisioterapia evalúa la causa de la limitación y diseña ejercicios seguros para recuperar el movimiento sin sobrecargar los tejidos.</p><h2>Movilidad, fuerza y confianza</h2><p>El tratamiento combina movilidad, control, fuerza y tareas funcionales adaptadas a las necesidades de cada paciente.</p><blockquote>Una evaluación temprana permite establecer objetivos claros y prevenir recaídas.</blockquote>'
  },
  {
    titulo: 'Cómo prevenir dolores musculares durante el trabajo',
    slug: 'prevenir-dolores-musculares-trabajo',
    resumen: 'Pequeños ajustes de postura, pausas activas y movimiento frecuente pueden reducir las molestias musculares durante la jornada laboral.',
    category: 'prevencion',
    image: '/uploads/blog/prevencion-entrenamiento.png',
    alt: 'Profesional guiando una postura corporal segura y controlada',
    content: '<h2>Cambia de posición con frecuencia</h2><p>Ninguna postura es perfecta si se mantiene durante demasiado tiempo. Levántate, camina y moviliza hombros y columna.</p><h2>Organiza tu espacio</h2><p>Ajusta la altura de la pantalla, apoya los pies y evita trabajar con los hombros elevados.</p><h2>Escucha las señales de tu cuerpo</h2><p>Si el dolor persiste o limita tus actividades, solicita una valoración profesional.</p>'
  },
  {
    titulo: 'Ejercicios y hábitos para mejorar tu bienestar físico',
    slug: 'ejercicios-habitos-bienestar-fisico',
    resumen: 'Integra movimiento, descanso y ejercicios sencillos en tu rutina para sentirte mejor y cuidar tu salud física todos los días.',
    category: 'bienestar',
    image: '/uploads/blog/evaluacion-dolor-espalda.png',
    alt: 'Evaluación profesional de la movilidad de la espalda',
    content: '<h2>Muévete de manera constante</h2><p>La actividad física regular mejora la circulación, mantiene la movilidad y fortalece el sistema musculoesquelético.</p><h2>Prioriza el descanso</h2><p>Dormir adecuadamente ayuda a recuperar tejidos y mejora la respuesta del cuerpo al ejercicio.</p><h2>Avanza gradualmente</h2><p>Elige actividades adecuadas a tu nivel y aumenta la intensidad poco a poco.</p>'
  }
];

async function seed() {
  try {
    await sequelize.authenticate();
    const author = await Usuario.findOne({ where: { rol: 'admin', activo: true } });
    if (!author) throw new Error('Se necesita un usuario administrador activo para crear los artículos de ejemplo.');
    for (const sample of samples) {
      const category = await BlogCategory.findOne({ where: { slug: sample.category } });
      if (!category) throw new Error(`No existe la categoría ${sample.category}. Ejecuta primero migrate:blog.`);
      const contenido = sanitizeBlogHtml(sample.content);
      await BlogPost.findOrCreate({
        where: { slug: sample.slug },
        defaults: {
          titulo: sample.titulo, slug: sample.slug, resumen: sample.resumen, contenido,
          imagenPortada: sample.image, imagenAlt: sample.alt, categoriaId: category.id,
          autorId: author.id, modificadoPorId: author.id, publicadoPorId: author.id,
          estado: 'PUBLICADO', destacado: false, fechaPublicacion: new Date(),
          tiempoLectura: readingTime(contenido)
        }
      });
    }
    console.log('Datos de ejemplo del blog creados sin duplicados.');
  } catch (error) {
    console.error('No se pudo crear el contenido de ejemplo:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

seed();
