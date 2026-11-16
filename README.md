# RumboWebApplication

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Carga y calibración de planos

Entra como administrador de clínica, registra una sede y un piso en **Clínicas y sedes**,
y abre **Mapas**. Selecciona la ubicación, carga un archivo o elige una versión
existente, y continúa a **Calibrar escala**. Marca dos puntos, ingresa su distancia
real y guarda. Al volver a abrir esa versión se recuperan los puntos y la escala.

La pantalla requiere una API local con las operaciones de sedes y pisos (PR-101),
almacenamiento y descarga de originales (PR-106), historial (PR-123) y calibración
de originales (PR-111 API). El historial y la medición se guardan en el backend.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## URL del API en producción

El build de producción (`npm run build`, el que ejecuta Vercel) toma la dirección del API de la variable
`API_URL` y genera `src/environments/environment.production.ts` con `scripts/set-api-url.mjs`.

- En Vercel: **Settings → Environment Variables → `API_URL`**, por ejemplo `https://rumbo-api-demo.onrender.com`
  (se acepta con o sin `/api/v1` al final). Se puede definir distinta para Production y Preview.
- Si `API_URL` no está definida se usa `https://rumbo-api-demo.onrender.com/api/v1`.
- En desarrollo (`ng serve`) se sigue usando `http://localhost:8080/api/v1`.
- El API debe permitir el origen de la web: en Render, `CORS_ALLOWED_ORIGINS` tiene que incluir el dominio de Vercel.
