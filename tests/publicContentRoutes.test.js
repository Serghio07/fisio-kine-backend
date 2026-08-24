const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { BlogCategory, BlogPost, GaleriaImagen } = require('../src/models');

const startServer = async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
};

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});

test('contenido publico responde sin token y las rutas administrativas siguen protegidas', async (t) => {
  const originals = {
    blogFindAndCountAll: BlogPost.findAndCountAll,
    blogFindAll: BlogPost.findAll,
    blogFindOne: BlogPost.findOne,
    categoryFindAll: BlogCategory.findAll,
    galleryFindAll: GaleriaImagen.findAll
  };

  BlogPost.findAndCountAll = async () => ({ rows: [], count: 0 });
  BlogPost.findAll = async () => [];
  BlogPost.findOne = async () => ({ id: 1, categoriaId: 1, slug: 'articulo-prueba' });
  BlogCategory.findAll = async () => [];
  GaleriaImagen.findAll = async () => [];

  t.after(() => {
    BlogPost.findAndCountAll = originals.blogFindAndCountAll;
    BlogPost.findAll = originals.blogFindAll;
    BlogPost.findOne = originals.blogFindOne;
    BlogCategory.findAll = originals.categoryFindAll;
    GaleriaImagen.findAll = originals.galleryFindAll;
  });

  const server = await startServer();
  t.after(() => closeServer(server));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  for (const path of [
    '/api/public/galeria',
    '/api/public/blog',
    '/api/public/blog/categories',
    '/api/public/blog/articulo-prueba',
    '/api/public/blog/articulo-prueba/relacionados'
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} debe ser publica`);
  }

  for (const path of ['/api/galeria', '/api/blogs']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, `${path} debe exigir autenticacion`);
  }
});
