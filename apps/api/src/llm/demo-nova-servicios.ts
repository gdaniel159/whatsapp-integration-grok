/**
 * DEMO CHATBOT DATA — fictional Nova Servicios.
 * Business-agnostic sample for post-seed demos. Not a platform default brand
 * and separate from PIPELINE MOCK DATA (seed-dev mock contacts).
 */

export const DEMO_BUSINESS_NAME = 'Nova Servicios';

export const DEMO_WELCOME_MESSAGE =
  '¡Hola! 👋 Bienvenido/a a {businessName}. Soy el asistente virtual: puedo ayudarte con información sobre instalación, mantenimiento y soporte. ¿En qué te ayudo?';

/** Kept in DB for backwards compatibility; not sent in conversational flow. */
export const DEMO_FIRST_ACTION_UNUSED = '';

export const DEMO_BUSINESS_PROFILE = {
  businessName: DEMO_BUSINESS_NAME,
  timezone: 'America/Lima',
  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
} as const;

export const DEMO_KB_CONTENT = `# Nova Servicios — Base de conocimiento (DEMO)

## Descripción
Nova Servicios es una empresa ficticia de demostración que ofrece instalación, mantenimiento y soporte técnico para equipos y sistemas empresariales. Atendemos consultas por WhatsApp y coordinamos visitas o revisiones con el equipo.

## Servicios
- **Instalación**: puesta en marcha de equipos y sistemas en sitio o remoto, según el caso.
- **Mantenimiento**: revisiones preventivas y correctivas para mantener operatividad.
- **Soporte técnico**: asistencia para incidencias, configuración y orientación de uso.
- **Capacitación básica**: inducción breve al equipo del cliente sobre el uso del servicio instalado (bajo coordinación).

No publicamos precios fijos en este canal. Toda cotización la prepara el equipo comercial según el alcance.

## Preguntas frecuentes
### ¿Qué servicios ofrecen?
Instalación, mantenimiento, soporte técnico y capacitación básica coordinada. Si necesitas otro alcance, un asesor lo evalúa.

### ¿Tienen precios en WhatsApp?
No publicamos tarifas definitivas aquí. Cuéntanos qué necesitas y un asesor te enviará una cotización formal.

### ¿Cómo pido una cotización?
Describe el servicio (instalación, mantenimiento o soporte), ubicación aproximada y urgencia. El equipo revisa la solicitud y te responde con la propuesta.

### ¿Atienden fuera de la ciudad?
Según disponibilidad y tipo de servicio. Confirma con el equipo al solicitar la cotización.

## Políticas
- No inventamos precios, descuentos ni plazos de entrega.
- Las cotizaciones las emite solo el equipo humano.
- Los **horarios de atención** oficiales están en el perfil del negocio (BusinessProfile); si hay conflicto con este texto, prevalece BusinessProfile.
- Si la consulta requiere decisión comercial o técnica específica, escalamos a un asesor.
`;
