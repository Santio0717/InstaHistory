# InstaHistory

## Proyecto Académico Interactivo de Memoria Histórica y Experiencias Inmersivas

![Logo UAO](img/Logo-uao.png)

---

# 2. Objetivo del Proyecto

El objetivo principal de este proyecto es desarrollar una plataforma interactiva que permita representar información histórica y audiovisual mediante una experiencia inmersiva utilizando:

- Tecnologías web modernas.
- Renderizado de modelos 3D.
- Comunicación en tiempo real.
- Controladores físicos.
- Recursos multimedia.

Además, se busca demostrar cómo diferentes tecnologías pueden integrarse en una sola experiencia interactiva funcional.

---

# Características Principales

## Interfaz Web Interactiva

La aplicación cuenta con múltiples vistas HTML para diferentes experiencias:

- Pantalla principal.
- Vista de experiencia.
- Vista de usuario.
- Vista previa.
- Pantalla QR.

## Integración de Modelos 3D

Se incluyen modelos y recursos visuales que permiten generar una experiencia tridimensional inmersiva.

## Sistema de Audio

La experiencia integra:

- Narraciones.
- Música de fondo.
- Audiodescripciones.

## Comunicación en Tiempo Real

Se utiliza WebSocket para conectar:

- El frontend.
- El servidor Node.js.
- El controlador en Python.

## Compatibilidad con Raspberry Pi

El sistema fue diseñado para ejecutarse en Raspberry Pi, permitiendo la conexión de controles físicos.

## Sistema de Interacción Física

Se implementó lectura de controles mediante Python utilizando gamepads o joysticks.

---

# Tecnologías Utilizadas

## Frontend

- HTML5
- CSS3
- JavaScript

## Backend

- Node.js
- WebSocket

## Integración Física

- Python
- Librería `inputs`
- Raspberry Pi

## Multimedia

- Audio MP3
- Videos MP4
- Modelos 3D

## Herramientas de Desarrollo

- Git
- GitHub
- VS Code
- Linux

---

# Arquitectura General del Proyecto

El proyecto se encuentra dividido en varios módulos:

```text
Usuario
   ↓
Frontend Web
   ↓
Servidor Node.js (WebSocket)
   ↓
Python Control WS
   ↓
Gamepad / Raspberry Pi
```

## Explicación General

### Frontend

Se encarga de:

- Mostrar la interfaz.
- Reproducir audio y video.
- Renderizar modelos.
- Recibir eventos.

### Servidor Node.js

Se utiliza como puente de comunicación entre:

- Frontend.
- Sistema de control.

### Python Control WS

Lee eventos del control físico y los transmite mediante WebSocket.

---

# Estructura del Repositorio

```text
InstaHistory-main/
│
├── assets/
│   ├── audio/
│   ├── modelos/
│   └── qrppt.png
│
├── audio/
│   ├── audiodescripcion.MP3
│   ├── fondo-qr.mp3
│   └── narracion-principal.MP3
│
├── css/
│   ├── styles.css
│   └── styles_Original.css
│
├── img/
│   └── Logo-uao.png
│
├── js/
│   ├── auth.js
│   ├── experience.js
│   ├── experienceusuario.js
│   ├── idb.js
│   ├── modelLoaders.js
│   ├── preview.js
│   ├── projectAssets.js
│   ├── reports.js
│   ├── results.js
│   ├── simbolos-data.js
│   ├── state.js
│   ├── testimonios.js
│   ├── usuario.js
│   └── videoIntro.js
│
├── animacion/
│   └── animacion-inicial.mp4
│
├── simbolos/
│   ├── simbolo1.png
│   ├── simbolo2.png
│   └── simbolo3.png
│
├── InteraccionControl/
│   ├── Frontend/
│   ├── Server/
│   ├── python/
│   └── start.sh
│
├── index.html
├── experience.html
├── experienceusuario.html
├── preview.html
├── qr.html
├── usuario.html
└── favicon.svg
```

---

# Flujo General del Sistema

## Paso 1

El usuario ingresa a la interfaz principal.

## Paso 2

La aplicación carga:

- Modelos.
- Recursos.
- Audio.
- Animaciones.

## Paso 3

El sistema establece conexión WebSocket.

## Paso 4

El control físico envía eventos mediante Python.

## Paso 5

El servidor Node.js retransmite los eventos.

## Paso 6

El frontend actualiza la experiencia visual en tiempo real.

---

# Instalación y Configuración

## Requisitos Previos

Antes de ejecutar el proyecto es necesario tener instalado:

### Node.js

Versión recomendada:

```bash
Node.js 18
```

### Python

Versión recomendada:

```bash
Python 3
```

### Git

```bash
sudo apt install git
```

---

## Clonar el Repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
```

Luego ingresar a la carpeta:

```bash
cd InstaHistory-main
```

---

# Ejecución del Proyecto

## Ejecución Normal del Frontend

Se puede abrir directamente el archivo:

```text
index.html
```

O utilizar un servidor local:

```bash
python3 -m http.server 3000
```

---

## Ejecución Completa del Sistema de Interacción de la Raspberry con control

Dentro de la carpeta:

```text
InteraccionControl/
```

Ejecutar:

```bash
./start.sh
```

Este script:

- Verifica Python.
- Crea el entorno virtual.
- Instala dependencias.
- Instala Node.js.
- Instala módulos.
- Inicia el servidor.
- Inicia el WebSocket.
- Abre automáticamente la aplicación.

---

# Funcionamiento de la Interacción con Control

El sistema de control funciona de la siguiente manera:

## Lectura del Control

Python detecta los eventos del gamepad utilizando:

```python
from inputs import get_gamepad
```

## Envío por WebSocket

Los datos se envían mediante:

```python
websocket.create_connection()
```

## Recepción en Node.js

El servidor recibe los eventos y los retransmite.

## Actualización del Frontend

JavaScript actualiza:

- Animaciones.
- Navegación.
- Experiencias visuales.

---

# Descripción de los Archivos Principales

## index.html

Pantalla principal del sistema.

## experience.html

Vista principal de la experiencia interactiva.

## experienceusuario.html

Versión enfocada en la interacción del usuario.

## preview.html

Pantalla de vista previa.

## qr.html

Vista relacionada con QR y recursos externos.

## styles.css

Archivo principal de estilos visuales.

## modelLoaders.js

Carga y configuración de modelos 3D.

## state.js

Manejo de estados globales.

## videoIntro.js

Controla las animaciones y video de introducción.

## control_ws.py

Módulo encargado de leer el control físico y enviar eventos.

## server.js

Servidor WebSocket principal.

---

# Modelos, Recursos y Multimedia

El proyecto integra múltiples recursos multimedia:

## Audios

- Narración principal.
- Música de fondo.
- Audiodescripción.

## Videos

- Animación inicial.
- Videos demostrativos.

## Imágenes

- Logos.
- Símbolos.
- Recursos gráficos.

## Modelos

Los modelos se encuentran dentro de:

```text
assets/modelos/
```

Estos modelos son utilizados para la experiencia inmersiva y holográfica.

---

# Experiencia del Usuario

Uno de los enfoques principales del proyecto fue la experiencia visual y la interacción.

Se implementaron:

- Colores inspirados en la UAO.
- Interfaz moderna.
- Animaciones.
- Audio ambiental.
- Navegación fluida.
- Visualización inmersiva.

Además, se realizaron ajustes específicos para:

- Fondos oscuros.
- Mejor iluminación de modelos.
- Mejor visualización tipo holograma.
- Distribución visual para múltiples caras del holograma.

---

# 17. Posibles Problemas y Soluciones

## Error: No module named pip

Solución:

```bash
sudo apt install python3-pip
```

---

## Error al ejecutar start.sh

Dar permisos:

```bash
chmod +x start.sh
```

Y luego ejecutar:

```bash
./start.sh
```

---

## Error de conexión WebSocket

Verificar que:

- El servidor Node.js esté activo.
- Python esté ejecutándose.
- El puerto 8080 esté libre.

---

## Problemas con Node.js

Instalar Node 18:

```bash
nvm install 18
```

---

# Mejoras Futuras

Algunas mejoras propuestas para el futuro:

- Optimización de modelos 3D.
- Mayor compatibilidad con dispositivos.
- Implementación de realidad aumentada.
- Integración con bases de datos.
- Panel administrativo.
- Sistema multiusuario.
- Mejoras en iluminación y renderizado.
- Mayor estabilidad del sistema holográfico.
- Compatibilidad VR.

---

# 19. Aprendizajes del Proyecto

Este proyecto permitió fortalecer conocimientos en:

- Desarrollo frontend.
- Comunicación en tiempo real.
- Integración hardware-software.
- Manejo de WebSockets.
- Renderizado multimedia.
- Experiencias inmersivas.
- Trabajo colaborativo.
- Integración de tecnologías.

Además, fue una experiencia importante para comprender cómo diferentes áreas del desarrollo pueden combinarse en una sola solución interactiva.

---

# Licencia

Este proyecto fue desarrollado con fines académicos y educativos.

El uso del contenido multimedia y recursos visuales debe respetar los derechos de autor correspondientes.
