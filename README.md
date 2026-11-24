# DeporStats 0.4.0

Código completo y editable de la web: React + TypeScript + Vite, backend TypeScript, modelo de cuotas, pruebas y configuración de alojamiento. Incluye el diseño de cristal, campo de fondo, reflejos en los bordes, colores neón, recomendaciones y comparativas Modelo / Casa.

La demostración usa partidos, históricos y precios sintéticos. No necesita una clave. El modo Real necesita OddsPapi y un histórico importado; no hay una tasa de acierto real demostrada. No se realizan apuestas desde la aplicación.

**Empieza por [la guía de instalación y despliegue](docs/DESPLIEGUE.md)**. Explica Windows, GitHub, Vercel, Blob, Cloudflare, el subdominio y las alternativas gratuitas.

## Probar en Windows

Instala Node.js 22 (la última revisión de esa rama) y abre PowerShell en esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Abre http://localhost:3000. Para parar, Ctrl+C. En desarrollo local sin secretos, las funciones de edición están disponibles; el servidor escucha solo en 127.0.0.1. `npm run dev` no es el comando de producción.

## Alojamiento

- **Vercel:** frontend estático + `api/index.ts` como función Node + Blob privado para modelos y cachés. `vercel.json` contiene la configuración. No requiere un servidor contratado aparte.
- **Servidor Node con disco persistente:** `npm run build` y `npm start`. Usa `data/`, o la ruta `DATA_DIR`. El proveedor debe conservar esa carpeta entre reinicios.
- Las rutas de interfaz usan `#/...`, de modo que no requieren reescrituras SPA. Las de API sí usan la regla incluida en `vercel.json`.

## Consulta pública y edición protegida

`ACCESS_MODE=public` es el valor predeterminado: cualquiera puede consultar la web. Solo se pide la contraseña de administración para importar históricos, entrenar y modificar equivalencias de equipos. En producción, omitir las credenciales deshabilita la edición; no la deja abierta.

`APP_PASSWORD` necesita al menos 16 caracteres y `SESSION_SECRET` al menos 32; usa dos valores aleatorios distintos. Se guardan únicamente en el servidor. La cookie de sesión es HttpOnly, SameSite=Strict, Secure con HTTPS y dura 12 horas. Cambiar cualquiera de esos secretos revoca las sesiones existentes. Es un acceso compartido de administración, no un sistema de cuentas por usuario.

`ACCESS_MODE=private` permite proteger también la consulta si alguna vez lo necesitas. La web incluye `noindex, nofollow` en el HTML y las cabeceras de producción. Esto afecta a buscadores que lo respeten, no impide visitar ni compartir la URL.

`ODDSPAPI_API_KEY` es solo del servidor. Nunca uses un prefijo `VITE_` para esa clave ni para los otros secretos. `.env` está excluido de Git. La aplicación utiliza **OddsPapi**, no el proveedor diferente llamado The Odds API.

## Datos y cálculo

1. En **Modelo**, activa el acceso de edición cuando estés en producción.
2. Elige competición e importa un CSV con `Date,HomeTeam,AwayTeam,FTHG,FTAG`, o JSON compatible. Opcionales: `Div,HxG,AxG,B365CH,B365CD,B365CA`. Se pueden unir temporadas de una misma liga. Límite: 3 MB / 8.000 partidos.
3. Entrena y evalúa. Se necesitan al menos 180 partidos y 30 fechas distintas. Importar sustituye el modelo de esa liga; conserva antes los históricos originales.
4. Revisa la evaluación cronológica: log loss, Brier, calibración y cobertura. El radar real exige como mínimo 150 partidos de prueba, mejora frente a la referencia de liga, resultados recientes y ausencia de avisos.
5. Configura `ODDSPAPI_API_KEY`, selecciona las competiciones en Ajustes y cambia a Real. Tu plan debe incluir los datos y Winamax España; no se ha verificado una cuenta real en esta entrega.
6. Abre un partido para consultar sus cuotas. El listado reutiliza los precios consultados; el detalle actualiza también el radar al volver. Si los nombres difieren, crea una equivalencia explícita en Modelo.

El calendario real abarca siete días y muestra como máximo 100 partidos conocidos. No se descargan automáticamente todas las cuotas de todos los partidos. Una celda «Sin cuota» significa que no hay un precio disponible: puede faltar una consulta, acceso al mercado o una correspondencia compatible en el adaptador. El detalle divide más de 400 selecciones en 21 bloques con un buscador global. El adaptador reconoce resultado, doble oportunidad, empate devuelve, totales, ambos marcan, goles por equipo, hándicaps, marcadores y goles exactos, par/impar, portería a cero, ganar sin encajar y otros mercados del marcador. Las combinaciones tienen cálculo, pero su correspondencia con cuotas reales aún no está verificada. No se inventan estadísticas de córners, tarjetas, jugadores o mitades. La demo usa precios sintéticos y omite precios extremos.

**Recomendadas**: probabilidad estimada de ganar ≥75 % y VE ≥+1 %. **Destacadas**: mayor VE entre las selecciones restantes. Ambas necesitan los controles anteriores y precios recientes. No significan que el resultado sea seguro. Los umbrales son criterios configurables del producto.

Más detalle en [MODELO.md](docs/MODELO.md), con fórmulas, fuentes y limitaciones, y en [INTERFAZ.md](docs/INTERFAZ.md), con los archivos que puedes editar para personalizarla.

## Estructura editable

| Ruta | Función |
| --- | --- |
| `src/pages/` | Panel, Partidos, detalle, Modelo y Ajustes; cada página con su carpeta |
| `src/components/` | Comparativas, destacados, filas, campo y acceso de edición |
| `src/styles.css` | Colores, cristal, luces y transiciones |
| `src/components/MarketBlocks.tsx`, `shared/market-catalog.ts` | Bloques, buscador global y límites de líneas |
| `server/expanded-markets.ts`, `shared/market-math.ts` | Mercados y devoluciones/medias liquidaciones asiáticas |
| `shared/comparisons.ts` | Recomendaciones, diferencias y fecha de hoy |
| `server/model.ts`, `markets.ts`, `evaluation.ts` | Modelo, mercados coherentes y evaluación cronológica |
| `server/providers/oddspapi.ts` | Conexión a OddsPapi v4 desde el servidor |
| `server/auth.ts` | Sesiones y permisos de consulta/edición |
| `server/blob-store.ts` | Persistencia privada en Vercel |
| `server/file-store.ts` | Persistencia en disco local/servidor Node |
| `api/index.ts`, `vercel.json` | Entrada y despliegue en Vercel |
| `tests/` | Comprobaciones matemáticas, datos, recomendaciones, acceso y almacenamiento |

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desarrollo local con recarga de cambios |
| `npm run check` | Comprobación de tipos TypeScript |
| `npm test` | Pruebas automatizadas |
| `npm run build` | Compila frontend y servidor Node |
| `npm start` | Ejecuta el servidor Node compilado |
| `npm run build:vercel` | Compila el frontend; Vercel compila la función de API |
| `npm run train -- historial.csv spain:laliga` | Entrena localmente y guarda en `data/`; no sube el modelo a Vercel |

La copia descargable es independiente de la publicación de demostración de ChatGPT. No contiene sus credenciales, identificadores de alojamiento ni datos privados. Para añadir anuncios o afiliación, revisar uso comercial y límites del proveedor de alojamiento y de datos.
