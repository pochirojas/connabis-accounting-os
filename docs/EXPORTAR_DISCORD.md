# Exportar el chat de gastos de Discord

Objetivo: sacar todos los mensajes del canal de gastos (con fotos) a un archivo JSON
e importarlos a **Gastos → Por revisar**. Nada entra al P&L sin que uno de los dos lo apruebe.

Herramienta: [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) (gratis, open source).

> Discord prohíbe automatizar cuentas de usuario ("self-bot") y puede banear la cuenta.
> Por eso usamos **un bot propio** agregado a nuestro servidor. Es la vía recomendada por el autor.
> Si el chat es un **DM o grupo** (no un servidor), un bot no puede leerlo: ver la opción B.

## Opción A — Canal en un servidor (recomendada)

### 1. Crear el bot (5 min, una sola vez)
1. Entra a <https://discord.com/developers/applications> → **New Application** → nombre "Export gastos".
2. Menú **Bot** → activa **Message Content Intent** → **Save Changes**.
3. En **Bot → Token** pulsa **Reset Token** y copia el token. Guárdalo, no lo compartas.
4. Menú **OAuth2 → URL Generator**: marca `bot`; en permisos marca **View Channels** y **Read Message History**.
5. Abre la URL generada, elige el servidor y autoriza.

### 2. Copiar el ID del canal
Discord → Ajustes → **Avanzado** → activa **Modo desarrollador**. Clic derecho en el canal de gastos → **Copiar ID del canal**.

### 3. Exportar
**Con la app de escritorio (Windows/macOS/Linux):** descarga `DiscordChatExporter.*.zip` de
[Releases](https://github.com/Tyrrrz/DiscordChatExporter/releases), pega el token del bot, elige el canal,
formato **JSON**, y en opciones avanzadas activa **Download assets/media**.

**Con la línea de comandos:**
```bash
./DiscordChatExporter.Cli export -t "TOKEN_DEL_BOT" -c ID_DEL_CANAL -f Json --media -o gastos.json
```
Opcional: `--after 2024-01-01` para un rango de fechas.

Resultado: `gastos.json` + una carpeta `gastos.json_Files/` con las fotos. **Mantenlos juntos.**

### 4. Importar
- **Desde la app:** Gastos → *Importar chat de Discord* → elegir `gastos.json` → *Previsualizar* → *Importar*.
  (Las fotos quedan como links de Discord, que expiran.)
- **Desde la terminal (recomendado, guarda las fotos):**
  ```bash
  npm run import-discord -- ./gastos.json            # vista previa
  npm run import-discord -- ./gastos.json --commit   # importar
  ```
- **O envíale el `.zip`** (json + carpeta) a quien administra el servidor y lo importa con el comando de arriba.

Re-importar el mismo archivo no duplica: cada mensaje se identifica por su ID de Discord.

### 5. Revisar
Cada mensaje queda en **Por revisar** con el monto, la cuenta (Nequi, Nu, Daviplata…) y la marca que se detectaron.
Abre cada uno, completa marca, categoría y tipo de soporte, y pulsa **Guardar y aprobar**.
Los mensajes sin monto (p. ej. "ok listo") se descartan con un clic.

### 6. Borrar el bot
Cuando termines: Developer Portal → la aplicación → **Delete App** (o expúlsalo del servidor).

## Opción B — DM o grupo (sin bot)
1. Discord → Ajustes → **Privacidad y seguridad** → **Solicitar todos mis datos** → marca *Mensajes*.
2. Discord envía un .zip por correo (puede tardar días). Trae **solo tus propios mensajes**, en `messages/c<ID>/messages.json`.
3. Cada uno de los dos tendría que pedir su paquete. Envíalos y se adapta el importador a ese formato.

## Qué detecta el importador
| En el mensaje | Resultado |
|---|---|
| `$45.000`, `45.000$`, `45k`, `45 mil`, `1,5 millones` | Monto COP (confianza alta) |
| `350000` sin símbolo | Monto COP (confianza media, revisar) |
| `22.99 usd` | Monto USD; falta TRM al revisar |
| `nequi`, `nu`, `tarjeta nu`, `daviplata`, `wompi`, `efectivo` | Cuenta de pago |
| `connabis` / `turros` | Marca |
| Fecha | La del mensaje, en hora de Bogotá |
| Autor | Queda como "pagado por" |
