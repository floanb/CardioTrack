# CardioTrack Cloud

Prototipo académico instalable (PWA) para monitoreo cardiaco remoto. La interfaz se publica como sitio estático en GitHub Pages y utiliza Supabase para autenticación, persistencia de registros, trazabilidad y almacenamiento en la nube.

> CardioTrack apoya la priorización y revisión de registros sintéticos. No confirma arritmias, no emite diagnósticos y no sustituye la valoración clínica.

## Funciones incluidas

- Inicio de sesión mediante Supabase Auth.
- Tablero clínico con métricas y alertas pendientes.
- Consulta de pacientes seudonimizados.
- Creación de señales ECG sintéticas para demostración.
- Persistencia compartida de registros en PostgreSQL/Supabase.
- Visualización de señal, frecuencia, calidad y complejos detectados.
- Registro de revisión de alertas y bitácora de auditoría.
- Diseño responsivo e instalación como aplicación web progresiva.

## Arquitectura

- **Frontend:** HTML, CSS y JavaScript sin proceso de compilación.
- **Hospedaje:** GitHub Pages.
- **Backend administrado:** Supabase Auth, PostgreSQL, API REST y Row Level Security.
- **Seguridad:** acceso anónimo revocado y operaciones limitadas a usuarios autenticados mediante RLS.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `cardiotrack`.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio.
3. Abre **Settings > Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Elige la rama **main**, la carpeta **/(root)** y pulsa **Save**.
6. Espera uno o dos minutos y abre la dirección que mostrará GitHub Pages.

La configuración pública del proyecto se encuentra en `supabase-config.js`. La clave `publishable` puede estar en el navegador; nunca coloques allí una clave `service_role`, una clave secreta ni la contraseña del usuario.

## Preparar Supabase desde cero

1. Ejecuta `supabase-schema.sql` en **Supabase > SQL Editor**.
2. Crea el usuario clínico en **Authentication > Users** y confirma su correo.
3. Revisa que existan 3 pacientes y 5 registros sintéticos.
4. En **Authentication > URL Configuration**, agrega la URL definitiva de GitHub Pages a las URL permitidas si se habilitan enlaces por correo o recuperación de contraseña.

## Uso de demostración

1. Abre el sitio publicado e inicia sesión con las credenciales entregadas por el equipo.
2. Consulta los registros sincronizados.
3. Crea un registro de prueba indicando paciente, frecuencia y ruido.
4. Abre el registro y, si requiere atención, marca la alerta como revisada.
5. Verifica desde otro dispositivo que los cambios permanecen y se comparten.

## Desarrollo local

No abras `index.html` directamente como archivo. Inicia un servidor local dentro de la carpeta:

```bash
python -m http.server 8080
```

Después abre `http://localhost:8080`.

## Aviso académico

Los pacientes, señales y resultados incluidos son sintéticos. Este prototipo no ha sido validado clínicamente ni autorizado como dispositivo médico.
