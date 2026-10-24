// Every user-facing text lives here (Spanish). Code, comments and identifiers stay in English.
// To translate the UI, copy this file (e.g. en.js) and change the import in the modules that use it.
import { plural } from '../core/format.js';

const files = (n) => plural(n, 'archivo', 'archivos');
const folders = (n) => plural(n, 'carpeta', 'carpetas');

export const strings = {
  controls: {
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    rotateLeft: 'Girar a la izquierda (Q)',
    rotateRight: 'Girar a la derecha (E)',
    reset: 'Centrar vista',
    hands: 'Mover el mapa con la mano (cámara)',
  },

  // Moving the map with a hand in front of the camera (the image never leaves the computer)
  hands: {
    starting: 'Encendiendo la cámara…',
    noHand: 'Muestra tu mano a la cámara',
    open: 'Junta pulgar e índice para agarrar el mapa',
    pinching: { grab: 'Agarrado: mueve o gira la mano', pan: 'Moviendo el mapa', rotate: 'Girando el mapa' },
    errors: {
      denied: 'No hay permiso para usar la cámara. Actívalo en la configuración del sistema.',
      noCamera: 'No encontré una cámara.',
      failed: 'No pude iniciar el seguimiento de la mano.',
    },
  },

  git: {
    title: (branch) => (branch ? `Git · ${branch}` : 'Git · HEAD suelto'),
    summary: ({ branches, commits, lastTag }) =>
      `${plural(branches, 'rama', 'ramas')} · ${plural(commits, 'commit', 'commits')}` + (lastTag ? ` · último tag ${lastTag}` : ''),
    risky: (n) => `⚠ ${plural(n, 'commit subió', 'commits subieron')} secretos`,
    loading: 'Leyendo el historial…',
    notRepo: 'Esta carpeta no usa git',
    notRepoHint: 'Inicializa un repositorio (git init) para ver tus ramas aquí.',
    gitMissing: 'No encontré git instalado en este equipo.',
    error: 'No pude leer el historial de git.',
    noProject: 'Abre un proyecto para ver sus ramas.',
    deleted: 'borrada',
    head: 'HEAD',
    laneNames: { merged: 'rama mezclada', unknown: 'sin rama' },
    commitSelected: ({ short, subject, author, date, lane, files }) => {
      const when = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      const list = files.slice(0, 8).map((f) => `${f.status} ${f.path}`).join('\n');
      const more = files.length > 8 ? `\n… y ${files.length - 8} más` : '';
      const changes = files.length ? `\n\n${plural(files.length, 'archivo', 'archivos')}:\n${list}${more}` : '\n\nCommit de merge (sin cambios propios).';
      return `🔹 ${short} · ${subject}\n${author} · ${when}\nRama: ${lane}${changes}`;
    },
    riskWarning: (files) =>
      `\n\n⚠ Este commit subió ${files.join(', ')}. Aunque se borre después, queda en el historial de git: rota esas claves y limpia la historia (por ejemplo con git filter-repo).`,
  },

  emptyState: {
    title: '¿Qué construimos hoy?',
    body: 'Crea un proyecto o abre uno que ya tengas para verlo en el mapa.',
    newAction: 'Nuevo proyecto',
    action: 'Abrir carpeta…',
    recentNone: 'Aquí verás los proyectos que abras.',
    // When a recent project was last opened (calendar days ago)
    when: (days) => (days === 0 ? 'hoy' : days === 1 ? 'ayer' : days < 7 ? `${days} d` : days < 30 ? `${Math.floor(days / 7)} sem` : `${Math.floor(days / 30)} m`),
  },

  // Floating editor: files clicked on the map open as tabs
  editor: {
    title: 'Editor',
    close: 'Cerrar el editor',
    closeTab: 'Cerrar pestaña',
    save: 'Guardar',
    saveHint: 'Guardar (⌘S)',
    saving: 'Guardando…',
    saved: 'Guardado',
    unsaved: 'Sin guardar',
    loading: 'Abriendo…',
    secret: 'Secreto',
    secretHint: 'Este archivo guarda secretos: tu agente no puede leerlo. Guardarlo pide confirmación.',
    confirmClose: (name) => `"${name}" tiene cambios sin guardar. ¿Cerrar y perderlos?`,
    stale: 'El archivo cambió en el disco mientras lo editabas.',
    reload: 'Recargar del disco',
    // CodeMirror's own texts (search panel, folding), by its English phrase
    phrases: {
      'Find': 'Buscar', 'Replace': 'Reemplazar', 'next': 'siguiente', 'previous': 'anterior', 'all': 'todos',
      'match case': 'mayúsculas', 'regexp': 'expresión regular', 'by word': 'palabra completa',
      'replace': 'reemplazar', 'replace all': 'reemplazar todo', 'close': 'cerrar',
      'current match': 'coincidencia actual', 'on line': 'en la línea', 'replaced match on line $': 'reemplazada en la línea $',
      'replaced $ matches': '$ reemplazos', 'Go to line': 'Ir a la línea', 'go': 'ir',
      'Folded lines': 'Líneas plegadas', 'Unfolded lines': 'Líneas desplegadas', 'to': 'a', 'folded code': 'código plegado',
      'unfold': 'desplegar', 'Fold line': 'Plegar línea', 'Unfold line': 'Desplegar línea', 'Control character': 'Carácter de control',
    },
    errors: {
      notFound: 'El archivo ya no existe.',
      notFile: 'No es un archivo.',
      tooLarge: 'Es demasiado grande para abrirlo aquí (máximo 2 MB).',
      binary: 'Es un archivo binario (imagen, fuente…): no se puede editar como texto.',
      'desktop-only': 'Disponible en la app de escritorio.',
      failed: 'No se pudo abrir el archivo.',
    },
  },

  panels: {
    backToMap: 'Volver al mapa',
    schemaTitle: 'Supabase · esquema public',
    schemaSummary: (tables, hasError) => (hasError ? `${tables} tablas · 1 con error` : `${tables} tablas · todo en orden`),
    breadcrumbLabel: 'Ruta de la carpeta',
    upHint: 'Esc sube un nivel',
  },

  hud: {
    seeRisks: 'Ver la lista de riesgos',
    security: 'Seguridad',
    files: 'Archivos',
    risk: 'En riesgo',
    review: 'A revisar',
    commits: 'Commits',
  },

  map: {
    files,
    risk: (n) => `${n} en riesgo`,
    review: (n) => `${n} a revisar`,
    rootSummary: (fileCount, folderCount) => `${files(fileCount)} · ${folders(folderCount)}`,
    watched: (fileCount) => `${files(fileCount)} vigilados`,
    allClear: 'Todo en orden',
    emptyFolder: 'vacía',
    more: (n) => `+${n} más`,
    integrations: 'Integraciones',
    defaultProjectName: 'proyecto',
    // The robot on the plaza of a new, empty project. It asks about the idea, never about technology, recommends a
    // stack and keeps coaching. What it says adapts to the person's level (models/userLevelModel.js): 'new' plain
    // words and analogies, 'some' the same with the real tech named, 'pro' straight and technical (`pro` texts).
    welcome: {
      // Every path is: start -> one question about the idea -> recommendation. Options of the second question carry
      // the stack they lead to (a key of `stacks`); `unsure` options tell the robot the person needs it simpler.
      // The 'level' step goes first only while the person's level is unknown.
      steps: [
        {
          id: 'start',
          title: '¡Hola! Soy tu guía 👋',
          question: '¿Qué te gustaría crear? Elige lo que más se parezca a tu idea.',
          hint: 'No hay respuestas incorrectas: tú pones la idea, yo me encargo de lo técnico.',
          options: [
            { label: '🛍️ Vender algo', next: 'shop' },
            { label: '🌐 Una página para mostrar algo', next: 'site' },
            { label: '📋 Algo para organizarme', next: 'tool' },
            { label: '🎮 Un juego', next: 'game' },
            { label: '💡 Tengo una idea, ayúdame', next: 'idea' },
          ],
        },
        {
          id: 'shop',
          title: '¡Buena idea! Vender en internet abre muchas puertas 🛍️',
          question: '¿Cómo te imaginas que la gente te compre?',
          options: [
            { label: '💬 Ven mis productos y me escriben por WhatsApp', next: 'recommend', stack: 'catalog' },
            { label: '💳 Pagan con tarjeta en la misma página', next: 'recommend', stack: 'shop' },
            { label: '🤷 Todavía no lo sé', next: 'recommend', stack: 'catalog', unsure: true },
          ],
        },
        {
          id: 'site',
          title: 'Una página propia, ¡qué bien! 🌐',
          question: '¿Qué podrá hacer la gente que la visite?',
          options: [
            { label: '👀 Ver información y fotos', next: 'recommend', stack: 'site' },
            { label: '✉️ Además, escribirme un mensaje', next: 'recommend', stack: 'site' },
            { label: '🔑 Crear su propia cuenta', next: 'recommend', stack: 'webApp' },
          ],
        },
        {
          id: 'tool',
          title: 'Organizarse es un superpoder 📋',
          question: '¿Quién la va a usar?',
          options: [
            { label: '🙋 Solo yo', next: 'recommend', stack: 'personalTool' },
            { label: '👥 Varias personas, cada una con su cuenta', next: 'recommend', stack: 'webApp' },
            { label: '🤷 No estoy seguro', next: 'recommend', stack: 'personalTool', unsure: true },
          ],
        },
        {
          id: 'game',
          title: '¡Un juego! Mi tipo de proyecto favorito 🎮',
          question: '¿Qué tipo de juego te imaginas?',
          options: [
            { label: '🕹️ De moverse y saltar, como Mario', next: 'recommend', stack: 'game' },
            { label: '🧩 De preguntas o adivinanzas', next: 'recommend', stack: 'quiz' },
            { label: '✨ Sorpréndeme', next: 'recommend', stack: 'game' },
          ],
        },
        {
          id: 'idea',
          title: 'Me encanta pensar ideas juntos 💡',
          question: '¿Qué te gustaría lograr con tu proyecto?',
          options: [
            { label: '💸 Ganar dinero', next: 'recommend', stack: 'catalog' },
            { label: '🗂️ Ordenar algo de mi día a día', next: 'recommend', stack: 'personalTool' },
            { label: '📣 Que la gente me conozca', next: 'recommend', stack: 'site' },
            { label: '😄 Divertir a otros', next: 'recommend', stack: 'game' },
          ],
        },
        {
          // Title and text come from the chosen stack (see `recommend` and `stacks`)
          id: 'recommend',
          options: [
            // `pro`: the label a programmer sees ("¿Qué significa eso?" is not offered to them)
            { label: '✨ ¡Me encanta, empecemos!', pro: '⚡ Generar el scaffold', action: 'createFiles' },
            { label: '🤔 ¿Qué significa eso?', action: 'explain' },
            { label: '💬 Prefiero conversarlo primero', pro: '💬 Discutir alternativas', action: 'talk' },
            { label: 'Lo exploro yo', pro: 'Lo armo yo', action: 'dismiss' },
          ],
        },
        {
          id: 'level',
          title: '¡Hola! Soy tu guía 👋',
          question: 'Antes de empezar, ¿cuánto sabes de programación? Así te hablo a tu medida.',
          options: [
            { label: '🌱 Nada, soy nuevo', level: 'new', next: 'start' },
            { label: '🌿 Un poco, he tocado algo de código', level: 'some', next: 'start' },
            { label: '🌳 Programo', level: 'pro', next: 'start' },
          ],
          skip: 'Prefiero no decirlo',
        },
      ],
      recommend: {
        title: 'Con lo que me contaste, ya tienes un plan 🧠',
        proTitle: 'Stack sugerido ⚡',
        text: (stack) => `Te recomiendo ${stack.name}. ${stack.why}`,
        someText: (stack) => `Te recomiendo ${stack.name} (${stack.tech}). ${stack.why}`,
        proText: (stack) => `${stack.tech}: ${stack.pro}`,
        inside: 'Por dentro usa',
        explainedTitle: 'Te lo explico con un ejemplo 🍳',
      },
      // The person's level: shown on the bubble (tap to change), the picker and the robot's suggestions
      levels: {
        new: '🌱 Principiante',
        some: '🌿 Algo sé',
        pro: '🌳 Programo',
        change: 'Cambiar cómo te hablo',
        footer: (label) => `Te hablo: ${label}`,
        footerAction: 'Cambiar',
        pickerTitle: '¿Cómo prefieres que te hable?',
        pickerText: 'Puedes cambiarlo cuando quieras. También ajusta el chat (Vibe o Dev).',
        cancel: 'Así está bien',
        suggest: {
          // to: the level the robot proposes
          title: { new: '¿Te lo explico más simple? 🌱', some: '¿Te hablo un poco más técnico? 🌿', pro: '¿Vamos directo al grano? 🌳' },
          up: 'Noto que manejas términos técnicos. ¿Quieres que te hable más directo, con los nombres reales de las cosas?',
          down: 'Noto que algunas cosas no quedaron claras. ¿Quieres que te explique todo más simple, con ejemplos?',
          yes: 'Sí, por favor',
          no: 'No, así está bien',
        },
      },
      // How each level asks the agent to answer (goes at the end of the robot's requests)
      voice: {
        new: 'No sé programar: explícame en palabras simples, sin jerga, qué hiciste y cómo lo veo funcionando, paso a paso.',
        some: 'Sé un poco de programación: usa los términos correctos, pero explica en media línea los que sean nuevos, y dime cómo lo veo funcionando.',
        pro: 'Soy desarrollador: sé directo y técnico, sin explicaciones básicas. Dime cómo correrlo.',
      },
      // What the robot recommends. `name` and `why` in plain words; `tech` is the real stack (small print and the
      // agent's prompt); `analogy` answers "¿Qué significa eso?"; `perks` are short reasons to feel confident.
      stacks: {
        catalog: {
          name: 'una tienda-catálogo',
          why: 'Muestras tus productos con fotos y precios, y un botón abre WhatsApp para cerrar la venta. Es la forma más rápida de empezar a vender.',
          tech: 'HTML + CSS + enlace a WhatsApp',
          pro: 'sitio estático con un link wa.me por producto; se publica gratis en Vercel o GitHub Pages, sin backend.',
          perks: ['Lista en un día', 'Gratis para publicar', 'Sin cobros raros'],
          analogy: 'Es como una vitrina: la gente mira desde la calle y, si algo le gusta, toca la puerta (te escribe). Tú no necesitas una caja registradora todavía.',
        },
        shop: {
          name: 'una tienda online con pagos',
          why: 'Tus clientes eligen, pagan con tarjeta y tú recibes el dinero. Es lo que usan muchos emprendimientos.',
          tech: 'Next.js + Stripe',
          pro: 'catálogo con SSG, Stripe Checkout para cobrar y un webhook para confirmar pedidos; Vercel para el deploy.',
          perks: ['Pagos seguros', 'Funciona en el celular', 'Crece contigo'],
          analogy: 'Next.js es el local (lo que la gente ve) y Stripe es el cajero de confianza que cobra por ti. Tú nunca tocas los datos de las tarjetas.',
        },
        site: {
          name: 'una página web sencilla',
          why: 'Rápida, bonita y fácil de cambiar. Si alguien quiere escribirte, agregamos un formulario.',
          tech: 'HTML + CSS',
          pro: 'estático y sin build; un formulario con Formspree si necesitas contacto. Deploy en Vercel o Pages.',
          perks: ['Carga rapidísimo', 'Gratis para publicar', 'Fácil de editar'],
          analogy: 'HTML es el texto y las fotos, como el contenido de una revista; CSS es el diseño: los colores, letras y márgenes.',
        },
        webApp: {
          name: 'una app web con cuentas de usuario',
          why: 'Cada persona entra con su correo y ve sus propias cosas. Las cuentas y los datos se guardan de forma segura.',
          tech: 'Next.js + Supabase',
          pro: 'Supabase Auth y Postgres con RLS por usuario; App Router con server actions. Deploy en Vercel.',
          perks: ['Inicio de sesión listo', 'Datos guardados en la nube', 'Se usa desde cualquier lugar'],
          analogy: 'Next.js es el edificio donde entra la gente y Supabase es la recepción con llaves: sabe quién es quién y guarda sus cosas bajo llave.',
        },
        personalTool: {
          name: 'una app personal que funciona en tu navegador',
          why: 'Guarda todo en tu propio computador, sin cuentas ni servidores. Si después quieres compartirla, la hacemos crecer.',
          tech: 'React + Vite',
          pro: 'SPA sin backend; estado persistido en localStorage o IndexedDB. Fácil de migrar a Supabase después.',
          perks: ['Sin registrarse', 'Tus datos se quedan contigo', 'Fácil de ampliar'],
          analogy: 'Es como una libreta inteligente: vive en tu computador, nadie más la ve, y puede hacer cálculos y recordatorios por ti.',
        },
        game: {
          name: 'un juego 2D que se juega en el navegador',
          why: 'Personajes, saltos y puntajes, y cualquiera lo juega desde un link, incluso en el celular.',
          tech: 'Phaser',
          pro: 'Phaser 3 con Vite: escenas, arcade physics y assets en un atlas; build estático para cualquier hosting.',
          perks: ['Sin instalar nada', 'Funciona en el celular', 'Ideal para empezar'],
          analogy: 'Phaser es como una caja de LEGO para juegos: ya trae las piezas (gravedad, choques, sonidos) y tú decides qué construir.',
        },
        quiz: {
          name: 'un juego de preguntas',
          why: 'Tú escribes las preguntas y el juego lleva los puntos. Es perfecto para compartir con amigos o en clases.',
          tech: 'HTML + CSS + JavaScript',
          pro: 'vanilla JS con las preguntas en un JSON; sin dependencias ni build.',
          perks: ['Listo muy rápido', 'Fácil de cambiar preguntas', 'Se comparte con un link'],
          analogy: 'Es como un concurso de la tele: tú eres quien escribe las tarjetas con preguntas y la página hace de presentador.',
        },
      },
      // The bubble's own controls
      ui: {
        progress: (step, of) => `Paso ${step} de ${of}`,
        coach: 'Tu guía',
        back: 'Atrás',
        rewind: (answer) => `Cambiar esta respuesta: ${answer}`,
        skip: 'Saltar',
        collapse: 'Minimizar',
        expand: 'Abrir la guía',
        close: 'Cerrar la guía',
        pill: 'Guía',
        skipTyping: 'Clic para ver todo',
      },
      // What "Guardar mi avance" types in the chat: a commit understood by models/gitIntent.js (not the agent)
      saveProgressPhrase: 'Guarda mis avances con el nombre "Primera versión"',
      // No agent chosen yet: the request waits until the person picks one in the agent panel
      pickAgent: '¡Ya casi! 🙌 Para escribir el código necesito un asistente de IA. Elige uno en el panel de la izquierda (usa tu propia suscripción) y empiezo con tu pedido apenas lo elijas.',
      // Requests the robot hands to the agent; `voice` is the line for the person's level (see `voice` above)
      scaffoldPrompt: (answers, stack, voice) =>
        `Quiero empezar un proyecto nuevo. Esto le conté a la guía:\n${answers.map((a) => `- ${a.question} ${a.chosen}`).join('\n')}\n\nLa guía me recomendó ${stack.name} (${stack.tech}). Crea lo mínimo para empezar, con un README y un .gitignore. ${voice}`,
      talkPrompt: (answers, stack, voice) =>
        `Quiero conversar mi idea antes de empezar. Esto le conté a la guía:\n${answers.map((a) => `- ${a.question} ${a.chosen}`).join('\n')}\n\nMe recomendó ${stack.name} (${stack.tech}). Hazme hasta 3 preguntas, una a la vez, para entender mejor mi idea, y dime si esa recomendación me sirve o qué alternativas hay. ${voice}`,
      // Coach mode: tips that react to the project while it grows. Plain words; the file names come second.
      // `pro`: the same tip for a programmer (title, text, button), short and technical
      tips: {
        waiting: {
          title: 'Tú tomaste las decisiones importantes 🧠',
          text: 'Ahora el agente escribe el código por ti. Cuando aparezca el primer archivo en el mapa, te cuento qué sigue.',
          ask: '💬 Hablar con el agente',
          change: '↩️ Cambiar mis respuestas',
          pro: { title: 'Esperando el scaffold ⏳', text: 'Cuando aparezca el primer archivo te marco lo que falta: .gitignore, README, secretos y el primer commit.' },
        },
        firstFile: {
          title: '¡Tu proyecto ya existe! 🎉',
          text: (name) => `Apareció ${name} en tu mapa. Yo lo vigilo: si algo se pone riesgoso, te aviso aquí mismo.`,
          pro: { title: 'Primer archivo ✅', text: (name) => `${name} está en el mapa. El semáforo ya lo evalúa.` },
        },
        gitignore: {
          title: 'Protejamos tus contraseñas 🔐',
          text: 'Te sugiero un archivo que evita que tus claves se publiquen por accidente (se llama .gitignore). Los profesionales siempre lo tienen.',
          ask: '✨ Agrégalo por mí',
          prompt: 'Crea un .gitignore adecuado para este proyecto (excluye .env, llaves y carpetas de dependencias). Explícame en una frase simple para qué sirve.',
          pro: { title: 'Falta .gitignore', text: 'Agrégalo antes del primer commit: .env*, llaves, node_modules y build.', ask: '⚡ Generarlo', prompt: 'Crea un .gitignore para este stack (.env*, llaves, dependencias y salidas de build). Sin explicaciones.' },
        },
        readme: {
          title: 'Preséntale tu proyecto al mundo 📝',
          text: 'Una ficha de presentación (README) cuenta qué hace tu proyecto. Es lo primero que la gente lee.',
          ask: '✨ Escríbela por mí',
          prompt: 'Escribe un README.md corto y amigable para este proyecto: qué es, para quién es y cómo verlo funcionando. Sin jerga.',
          pro: { title: 'Falta README', text: 'Setup, scripts y variables de entorno necesarias.', ask: '⚡ Generarlo', prompt: 'Escribe un README.md técnico y breve: setup, scripts, variables de entorno (sin valores) y deploy.' },
        },
        risk: {
          title: { red: 'Encontré algo delicado 🚨', yellow: 'Vale la pena revisar esto ⚠️' },
          text: (path, reason) => `${reason} (${path}). Tranquilo: Remi lo puede arreglar contigo.`,
          repair: '🔧 Arréglalo con Remi',
          locate: '📍 Muéstramelo',
          pro: { title: { red: 'Riesgo en rojo 🚨', yellow: 'Para revisar ⚠️' }, text: (path, reason) => `${path} · ${reason}`, repair: '🔧 Reparar con Remi', locate: '📍 Ver en el mapa' },
        },
        saveProgress: {
          title: 'Guarda una foto de tu avance 📸',
          text: 'Así siempre puedes volver a este punto si algo sale mal después. Los programadores lo llaman "commit".',
          save: '📸 Guardar mi avance',
          pro: { title: 'Primer commit', text: 'Lo básico está listo: buen momento para el commit inicial.', save: '📸 Commit "Primera versión"' },
        },
        allSet: {
          title: '¡Lo estás haciendo increíble! 🚀',
          text: 'Tu proyecto tiene todo lo básico y nada en rojo, como el de un profesional. Me retiro; el semáforo del mapa sigue cuidándolo.',
          bye: '👋 ¡Gracias, guía!',
          pro: { title: 'Todo en orden ✅', text: 'Base lista y sin riesgos. El semáforo sigue vigilando.', bye: 'Cerrar la guía' },
        },
        next: 'Entendido',
      },
    },
  },

  // Integration nodes in the band at the top of the map (brand names)
  integrations: {
    names: { vercel: 'Vercel', github: 'GitHub', clerk: 'Clerk', posthog: 'PostHog' },
    status: { connected: 'conectado', incident: 'con una incidencia', disconnected: 'desconectado' },
  },

  supabase: {
    connected: 'Supabase · conectado',
    vulnerable: 'Supabase · RLS desactivado',
    critical: 'CRÍTICO',
    latency: (ms) => `${ms} ms`,
    exposed: 'expuesto',
    rlsOn: 'RLS ON',
    rlsOff: 'RLS OFF',
  },

  security: {
    levels: { green: 'Seguro', yellow: 'Revisar', red: 'Riesgo', grey: 'Sin evaluar' },
    levelWithEmoji: { green: '🟢 Seguro', yellow: '🟡 Revisar', red: '🔴 Riesgo', grey: '⚪ Sin evaluar' },
    reasons: {
      envTemplate: 'Plantilla de variables de entorno: verifica que no tenga valores reales.',
      envFile: 'Archivo .env: suele tener claves y secretos, y no debería estar en el repositorio.',
      privateKey: 'Llave o certificado privado dentro del proyecto.',
      secretName: 'El nombre sugiere credenciales o secretos guardados en el código.',
      sql: 'SQL o migración: revisa permisos y políticas RLS.',
      sensitiveLogic: 'Lógica sensible (autenticación o sesiones): conviene revisarla.',
      config: 'Configuración: revisa que no exponga datos ni dé permisos de más.',
      clean: 'Sin señales de riesgo.',
    },
    // Same reasons for "dev" mode: which rule matched and what to do about it
    techReasons: {
      envTemplate: 'Regla: nombre .env.(example|sample|template). Comprueba que solo tenga claves vacías o de ejemplo.',
      envFile: 'Regla: nombre ^.env(.*)?. Secretos versionados: rotar las claves, git rm --cached y añadir a .gitignore.',
      privateKey: 'Regla: extensión .pem/.key/.p12/.pfx/.keystore/.jks o id_rsa*. Revocar la llave y sacarla del repo.',
      secretName: 'Regla: el nombre contiene secret/credential/password/private_key/service_account. Mover a variables de entorno.',
      sql: 'Regla: extensión .sql. Verificar ENABLE ROW LEVEL SECURITY y políticas por tabla.',
      sensitiveLogic: 'Regla: auth/login/session/token/jwt/middleware/crypto. Revisar validación de sesión, expiración y rutas sin auth.',
      config: 'Regla: archivo de configuración (Dockerfile, *.config.*, *.yml, vercel.json…). Revisar permisos y valores expuestos.',
      clean: 'Ninguna regla de riesgo coincide.',
    },
    byAgent: 'Evaluado por el agente.',
    byRemi: 'Plan de Remi.',
    byDemo: 'Regla de demo: el agente de IA lo evaluará más adelante.',
  },

  // Folder tags (models/folderTags.js) and the friendly names of "vibe" mode
  tags: {
    ui: 'Interfaz',
    scene3d: '3D',
    logic: 'Lógica',
    data: 'Datos',
    server: 'Servidor',
    desktop: 'Escritorio',
    agent: 'Agente',
    security: 'Seguridad',
    tests: 'Pruebas',
    docs: 'Documentación',
    config: 'Configuración',
    assets: 'Recursos',
  },
  folders: {
      root: { name: 'Edificio principal', summary: 'La raíz del proyecto: lo que está fuera de las carpetas.' },
      screen: { name: 'Lo que ves en pantalla', summary: 'Todo lo que aparece en la ventana: mapa, paneles, chat y estilos.' },
      components: { name: 'Piezas de la pantalla', summary: 'Botones, paneles y vistas que dibujan lo que ves.' },
      styles: { name: 'Colores y estilos', summary: 'Cómo se ve todo: colores, tamaños, efectos de vidrio y animaciones.' },
      scene: { name: 'Escena 3D', summary: 'Las carpetas, los riesgos, Remi y la cámara del mapa.' },
      viewmodels: { name: 'Estado de cada pantalla', summary: 'Qué muestra cada parte y qué pasa al hacer clic, sin dibujar nada.' },
      services: { name: 'Conexiones', summary: 'Habla con el disco, la app de escritorio y tu agente de IA.' },
      core: { name: 'Cómo funciona por dentro', summary: 'Piezas básicas que usa el resto del código.' },
      models: { name: 'Datos que recuerda la app', summary: 'El proyecto abierto, el semáforo de cada archivo y lo que eligió la persona.' },
      database: { name: 'Base de datos', summary: 'Tablas, migraciones y reglas de quién puede leer qué.' },
      server: { name: 'Servidor', summary: 'Lo que corre fuera de la pantalla y responde a la app.' },
      desktop: { name: 'App de escritorio', summary: 'La ventana, los permisos al disco, el servidor local y los agentes con tu suscripción.' },
      agent: { name: 'Inteligencia artificial', summary: 'Instrucciones y conexiones del agente de IA.' },
      security: { name: 'Seguridad y accesos', summary: 'Quién puede entrar y qué puede hacer.' },
      tests: { name: 'Pruebas automáticas', summary: 'Revisiones que se corren solas para que nada se rompa.' },
      docs: { name: 'Documentación', summary: 'Explicaciones, decisiones e instrucciones del proyecto.' },
      automation: { name: 'Automatizaciones y ajustes', summary: 'Lo que se ejecuta solo al subir cambios o publicar versiones.' },
      assets: { name: 'Imágenes y archivos', summary: 'Logos, imágenes, fuentes y archivos que se sirven tal cual.' },
      i18n: { name: 'Textos e idiomas', summary: 'Todas las frases que lee la persona, en un solo lugar.' },
  },
  // Name + sentence of a folder from folderTags.folderGuide(): { key, tags }
  describeFolder: ({ key, tags }, folder) => {
    if (key) return strings.folders[key];
    const tag = strings.tags[tags[0]];
    return { name: tag ? `${tag} · ${folder}` : folder, summary: tag ? `Archivos de ${tag.toLowerCase()}.` : 'Archivos del proyecto.' };
  },

  devTree: {
    search: 'Buscar archivo o carpeta…',
    expandAll: 'Expandir todo',
    collapseAll: 'Contraer todo',
    onlyRisks: 'Solo riesgos',
    map: 'Ver en el mapa',
    repair: 'Reparar',
    copyPath: 'Copiar ruta',
    copied: 'Ruta copiada',
    noMatches: 'Nada coincide con la búsqueda.',
    by: { agent: 'IA', remi: 'Remi' },
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`),
    matches: (n) => (n === 1 ? '1 resultado' : `${n} resultados`),
  },

  mode: {
    vibe: 'Vibe',
    tech: 'Dev',
    title: 'Cómo te hablo',
    info: 'Vibe: una guía con nombres sencillos. Dev: todas las carpetas, rutas y reglas.',
  },

  hover: {
    clickFolder: 'Clic para entrar al edificio',
    clickFile: 'Clic para ver el detalle',
    atRisk: (n) => `${n} en riesgo`,
    toReview: (n) => `${n} por revisar`,
    noRisks: 'Sin riesgos',
    files,
    floor: 'Piso',
    path: 'Ruta',
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`),
  },

  repair: {
    name: 'Remi · reparador',
    step: (i, n) => `paso ${i}/${n}`,
    queued: (n) => `${n} en fila`,
    working: 'Arreglando',
    steps: ['Caminando hacia el problema', 'Mirando el problema', 'Reparando', 'Revisando el resultado', 'Listo'],
    stepsAgent: (agent) => ['Caminando hacia el problema', 'Mirando el problema', `${agent} está reparando`, 'Revisando el resultado', 'Listo'],
    outcome: { fixed: 'Reparado: revísalo', planned: 'Plan listo', clear: 'Falsa alarma: está bien', failed: 'No se pudo reparar' },
    fixedToVerify: (n) => `Tu agente cambió ${n === 1 ? '1 archivo' : `${n} archivos`} para arreglarlo. Revísalo y márcalo como verificado.`,
    timeout: 'El agente tardó demasiado.',
    cancelled: 'Se canceló.',
    verified: 'Verificado',
    undo: 'Deshacer cambio',
    undone: 'Deshecho',
    agentFixPrompt: (path, reason) =>
      `Repara este problema de seguridad del archivo ${path}: ${reason}\n` +
      '1. Lee el archivo con platanus_read_file (si se niega porque tiene secretos, no insistas).\n' +
      '2. Si hay un arreglo pequeño y seguro editando archivos del proyecto, escribe el archivo completo corregido con platanus_write_file y explica el cambio en "reason". La persona aprobará cada cambio. Si el arreglo no se hace editando (por ejemplo, rotar claves en otro servicio), no escribas nada.\n' +
      '3. Explica con tres tarjetas cortas: "> [!riesgo] Qué encontré", "> [!ok] Qué cambié" (o "> [!nota] Por qué no cambié nada") y "> [!paso] Qué te falta hacer a ti".',
    chat: {
      started: (path, agent) => (agent ? `Remi y ${agent} empezaron a revisar ${path}` : `Remi empezó a revisar ${path}`),
      // Title of a repair's card in the chat
      title: (agent) => (agent ? 'Remi y tu agente' : 'Remi'),
      working: (name) => `Revisando ${name}…`,
      changed: (path, reason) => `Guardé un cambio en ${path}: ${reason}`,
      finished: {
        fixed: (path, n) => `Reparación de ${path}: ${n === 1 ? '1 archivo cambiado' : `${n} archivos cambiados`}. Quedó en amarillo hasta que lo verifiques en el historial de reparaciones.`,
        planned: (path) => `Plan de reparación de ${path} listo. Cuando lo apliques, márcalo en el historial de reparaciones.`,
        failed: (path, why) => `No se pudo reparar ${path}. ${why}`,
        verified: (path) => `${path} quedó verificado.`,
        clear: (path) => `Falsa alarma: ${path} está bien y quedó en verde. No hacía falta cambiar nada.`,
      },
      planTitle: 'Pasos:',
    },
    myPlan: 'Mi plan',
    fromAgent: (agent) => `Plan escrito con ${agent}`,
    fromGuide: 'Plan de la guía de Platanus',
    honest: 'Remi no cambia archivos. Tu agente sí puede, pero solo con tu aprobación y guardando una copia para deshacer. El archivo queda en amarillo hasta que lo verifiques.',
    markFixed: 'Ya lo apliqué',
    close: 'Cerrar',
    repair: 'Reparar',
    repairing: 'Remi trabajando…',
    queuedShort: 'En fila',
    chip: 'Reparar con Remi',
    chipWorst: 'Reparar lo más grave',
    plannedReason: (first) => `Remi dejó un plan: ${first}. Falta aplicarlo.`,
    fixedReason: 'Arreglado siguiendo el plan de Remi.',
    nothing: 'No hay riesgos para reparar. ¡Todo en orden! 🟢',
    started: (path) => `🔧 Remi va a revisar ${path}.`,
    history: {
      title: 'Reparaciones',
      intro: 'Todo lo que Remi y tu agente repararon o dejaron pendiente.',
      empty: 'Todavía no hay reparaciones. Toca "Reparar" en un riesgo.',
      clear: 'Limpiar terminadas',
      status: { queued: 'En fila', working: 'Trabajando', planned: 'Plan listo', fixed: 'Por verificar', verified: 'Verificado', clear: 'Falsa alarma', failed: 'Falló' },
      by: (agent) => (agent ? `con ${agent}` : 'con la guía de Platanus'),
      changes: 'Cambios',
      plan: 'Pasos',
      explanation: 'Lo que explicó el agente',
      created: 'archivo nuevo',
      interrupted: 'Se cortó porque la app se cerró mientras trabajaba.',
      verify: 'Marcar verificado',
      retry: 'Reintentar',
      open: 'Ver en el mapa',
      ago: (iso) => {
        const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
        return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
      },
    },
    agentPrompt: (path, reason) =>
      `Lee el archivo ${path} con platanus_read_file si puedes. El problema es: ${reason}. ` +
      'Responde SOLO con 3 pasos cortos para arreglarlo, uno por línea, cada línea empezando con "- ". No cambies ningún archivo.',
    plans: {
      envFile: ['Sacar el archivo .env del repositorio y agregarlo a .gitignore', 'Cambiar las claves que tenía (ya pudieron verse)', 'Guardar las claves nuevas en las variables del servidor'],
      privateKey: ['Quitar la llave del proyecto y guardarla en un lugar seguro', 'Crear una llave nueva y dar de baja la anterior', 'Agregar ese tipo de archivo a .gitignore'],
      secretName: ['Buscar contraseñas o claves escritas a mano en el archivo', 'Moverlas a variables de entorno', 'Cambiar las que ya estuvieron en el código'],
      envTemplate: ['Revisar que solo tenga nombres de variables, sin valores reales', 'Si hay un valor real, borrarlo y cambiar esa clave'],
      sql: ['Revisar que cada tabla tenga RLS activado', 'Crear una regla para que cada persona solo vea sus datos', 'Probar con la anon key que no se pueda leer todo'],
      sensitiveLogic: ['Revisar quién puede entrar sin iniciar sesión', 'Comprobar que las sesiones caduquen', 'Pedirle al agente una revisión línea por línea'],
      config: ['Revisar que no tenga claves ni datos privados', 'Quitar permisos que no se usen', 'Dejar solo lo necesario para producción'],
      other: ['Revisar el archivo con el agente', 'Corregir lo que encuentre', 'Volver a revisar el semáforo'],
    },
  },

  // The robot on the map: the person drags or throws it onto a folder and it asks what to do there
  robot: {
    hint: 'Arrástrame o lánzame a una carpeta',
    dropHere: (name) => `Suéltame aquí: ${name}`,
    nowhere: 'Aquí no hay nada. Suéltame sobre una carpeta y te cuento qué hay.',
    at: (name) => `Estoy en ${name}`,
    ask: '¿Te explico qué hay aquí o quieres cambiar algo?',
    // its choices on the map, short (the chat card has the full wording)
    short: { ask: 'Explícame', edit: 'Cambiar algo', locate: 'Riesgos', tour: 'Recorrido' },
    chat: {
      here: 'El robot está aquí',
      where: (name, n) => `${name} · ${n === 1 ? '1 archivo' : `${n} archivos`}`,
      wholeProject: 'Todo el proyecto',
      projectSummary: 'La plaza: aquí se ve el proyecto completo y sus archivos sueltos.',
      allGood: 'Sin problemas',
      risks: (red, yellow) => [red && `${red} en riesgo`, yellow && `${yellow} por revisar`].filter(Boolean).join(' · '),
      explain: 'Explícame qué hay aquí',
      explainPrompt: (name) => `Explícame con palabras simples qué hay en «${name}», para qué sirve y qué archivo debería mirar primero.`,
      explainProject: 'Explícame el proyecto',
      explainProjectPrompt: 'Explícame con palabras simples cómo está armado este proyecto y por dónde debería empezar.',
      change: 'Quiero cambiar algo aquí',
      changeDraft: (name) => `En «${name}» quiero `,
      risks2: 'Ver sus riesgos',
      tour: 'Recorrido desde aquí',
    },
  },

  // Building live: the robot carries each file the agent saves to its folder (viewmodels/buildViewModel.js)
  build: {
    title: 'Construyendo',
    finished: 'Obra terminada',
    saving: (name) => `Llevo «${name}» a su carpeta`,
    waiting: (name) => `Espero tu permiso para guardar «${name}»`,
    saved: (name) => `«${name}» guardado`,
    edited: (name) => `Actualicé «${name}»`,
    notSaved: (name) => `«${name}» no se guardó`,
    done: (n, edits) => `Listo: ${[n && `${n} ${n === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, edits && `${edits} ${edits === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' y ') || 'nada nuevo'}`,
    root: 'Archivos sueltos',
    papers: (n, edits) => [n && `+${n} ${n === 1 ? 'archivo nuevo' : 'archivos nuevos'}`, edits && `${edits} ${edits === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' · ') || 'En obra',
  },

  // "Recorrido": a guided walk through a project the person does not know yet (models/tourSpec.js)
  tour: {
    chip: 'Recorrido del proyecto',
    menu: 'Recorrido',
    title: 'Recorrido del proyecto',
    analyzing: 'Mirando cómo está armado tu proyecto…',
    writing: 'Preparando la explicación…',
    stepOf: (n, total) => `Paso ${n} de ${total}`,
    prev: 'Anterior',
    next: 'Siguiente',
    exit: 'Salir',
    finish: 'Terminar',
    again: 'Repetir',
    ended: 'Recorrido terminado',
    narratedBy: (agent) => `Narrado por ${agent}`,
    automatic: 'Recorrido automático',
    flow: 'Por dónde pasa',
    ghost: 'Sin problemas',
    busy: 'Espera a que Remi termine la reparación para hacer el recorrido.',
    empty: 'Este proyecto todavía está vacío. Cuando tenga archivos, te lo recorro.',
    chips: {
      open: (name) => `Abrir ${name}`,
      folder: (name) => `Ver ${name}`,
      ask: 'Preguntar',
    },
    askPrompt: (name) => `Acabo de llegar a este proyecto. ¿Qué debería entender primero de ${name}?`,
    // Architecture kinds (projectAnalyzer.js)
    kinds: {
      monolith: 'Una sola aplicación',
      monorepo: 'Varias partes en un mismo lugar',
      services: 'Varios servicios',
      library: 'Una librería',
      unknown: 'Proyecto',
    },
    unitKinds: { app: 'aplicación', package: 'pieza compartida', service: 'servicio' },
    // What a part is, by its first tag (folderTags.js)
    parts: {
      ui: 'Lo que la gente ve y toca: pantallas, botones y estilos.',
      scene3d: 'Lo que se dibuja en 3D.',
      logic: 'Las reglas: lo que pasa cuando alguien hace algo.',
      agent: 'Lo que habla con la inteligencia artificial.',
      desktop: 'La app de escritorio: la ventana y el acceso a la computadora.',
      server: 'El servidor: recibe pedidos y responde.',
      data: 'Donde se guarda y se ordena la información.',
      other: 'Una parte del proyecto.',
    },
    // Text when no agent narrates (or what it did not write). ctx comes from tourSpec.js
    script: {
      place: {
        title: 'Así está armado',
        bubble: '¡Hola! Te muestro el proyecto',
        vibe: {
          monolith: () => 'Es una sola aplicación: todo vive junto y se arranca de una vez. Eso la hace fácil de seguir.',
          monorepo: ({ count }) => `Es un monorepo: ${count} partes que viven en el mismo lugar y comparten piezas entre sí.`,
          services: ({ count }) => `Son ${count} servicios separados que trabajan juntos; cada uno se arranca por su cuenta.`,
          library: () => 'Es una librería: código pensado para que otras aplicaciones lo usen.',
          unknown: () => 'No encontré una forma conocida, así que te muestro lo más importante que hay.',
          empty: () => 'Este proyecto todavía está vacío.',
        },
        dev: {
          monolith: ({ stack, run }) => `Monolito${stack ? ` (${stack})` : ''}: una sola app${run ? `; se arranca con «${run}»` : ''}.`,
          monorepo: ({ count, units, manager }) => `Monorepo${manager ? ` con ${manager}` : ''}: ${count} paquetes (${units}).`,
          services: ({ count, units }) => `${count} servicios independientes: ${units}.`,
          library: ({ stack }) => `Librería${stack ? ` (${stack})` : ''}: exporta código, no tiene servidor propio.`,
          unknown: () => 'Sin una estructura conocida: recorro las carpetas principales.',
          empty: () => 'Proyecto vacío.',
        },
      },
      readme: {
        title: 'Empieza por el README',
        bubble: 'Aquí está la portada',
        say: ({ sections }) => `Es la portada del proyecto: dice qué hace y cómo arrancarlo.${sections ? ` Tiene secciones como ${sections}.` : ''}`,
      },
      guide: {
        title: ({ name }) => `Guía: ${name}`,
        bubble: 'Aquí explican cómo pensaron todo',
        say: () => 'El equipo escribió aquí cómo está pensado el proyecto. Vale la pena leerla después del README.',
      },
      part: {
        title: ({ name }) => name,
        bubble: ({ label }) => label,
        vibe: ({ what }) => what,
        dev: ({ what, path, kind }) => `${kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : 'Carpeta'} ${path}/: ${what.charAt(0).toLowerCase()}${what.slice(1)}`,
      },
      entry: {
        title: 'Aquí arranca todo',
        bubble: 'Esta es la puerta de entrada',
        vibe: ({ name }) => `«${name}» es lo primero que se ejecuta: desde aquí se enciende el resto.`,
        dev: ({ path, why }) => `Punto de entrada: ${path}${why ? ` (${why})` : ''}.`,
        why: { pkgMain: 'según package.json', pkgBin: 'comando de package.json', framework: 'página principal', name: 'por su nombre' },
      },
      tests: {
        title: 'Las pruebas',
        bubble: 'Esto revisa que nada se rompa',
        say: ({ count, runner }) => `${count === 1 ? 'Hay 1 prueba' : `Hay ${count} pruebas`} que revisan solas que todo funcione${runner ? ` (se corren con ${runner})` : ''}. Si cambias algo, córrelas.`,
      },
      usecase: {
        title: ({ label }) => `Caso de uso: ${label}`,
        bubble: ({ label }) => `Así funciona «${label}»`,
        say: ({ label, path, from }) => `${{ route: 'Cuando alguien pide', page: 'Cuando alguien abre la página de', command: 'Cuando alguien ejecuta' }[from] ?? 'Para'} «${label}», todo empieza en ${path}.`,
      },
      start: {
        title: 'Por dónde empezar',
        bubble: '¡Listo! Empieza por aquí',
        say: ({ doc, entry }) => [doc && `Lee primero ${doc}`, entry && `luego abre ${entry}`].filter(Boolean).join(' y ').replace(/^./, (c) => c.toUpperCase())
          .concat(doc || entry ? '. ' : '', 'Cuando algo no se entienda, pregúntame: te lo explico con tus palabras.'),
      },
      emptyStart: 'Cuando tenga archivos, vuelve a pedirme el recorrido.',
    },
  },

  shell: {
    brand: 'Platanus',
    search: 'Buscar o hacer algo…',
    searchShortcut: '⌘K',
    closePanel: 'Cerrar el panel',
    menus: { file: 'Proyecto' },
    actions: {
      newProject: 'Nuevo proyecto',
      openProject: 'Abrir proyecto',
      closeProject: 'Cerrar proyecto',
      openRecent: 'Abrir reciente',
      noRecent: 'Sin proyectos recientes',
    },
    rail: { explorer: 'Explorador', risks: 'Riesgos', repairs: 'Reparaciones', servers: 'Servidores', agent: 'Conecta tu agente', map: 'Mapa 3D', git: 'Ramas de git', chat: 'Agente' },
    // Shown when hovering a rail button or a tab
    railInfo: {
      explorer: 'Las partes de tu proyecto con etiquetas y su semáforo.',
      risks: 'Lo que está en rojo o amarillo. Desde aquí Remi lo repara.',
      repairs: 'Historial de lo que se reparó, lo que falta verificar y lo que falló.',
      servers: 'Lo que está escuchando en un puerto de tu computadora, y si tu red lo puede ver.',
      agent: 'Elige qué IA responde y conéctala desde tu editor.',
      map: 'Tu proyecto en 3D: lo que tiene problemas brilla en ámbar o rojo.',
      git: 'Tus ramas y commits, y si algún commit subió un secreto.',
      chat: 'Habla con el agente en palabras sencillas.',
    },
    tabInfo: {
      map: (folders, atRisk) => `${folders} carpetas · ${atRisk ? `${atRisk} en riesgo` : 'sin riesgos'}`,
    },
    recent: 'Recientes',
    explorerGuide: 'Guía de tu proyecto: qué hay en cada parte.',
    allFiles: 'Archivos sueltos',
    sidebar: {
      explorer: 'Explorador',
      risks: 'Riesgos',
      repairs: 'Reparaciones',
      servers: 'Servidores',
      agent: 'Conecta tu agente',
      noProject: 'Abre un proyecto para ver sus carpetas.',
      noRisks: 'Ningún archivo en rojo o amarillo. ¡Bien!',
      risksSummary: (red, yellow) => `${red} en riesgo · ${yellow} por revisar`,
      openFolder: (name) => `Abrir ${name} en el mapa`,
    },
    // Servers listening on this computer (spec/001-running-servers.md)
    servers: {
      intro: 'Programas de tu computadora que esperan conexiones en un puerto. Se actualiza solo cada pocos segundos.',
      loading: 'Buscando servidores…',
      empty: 'No hay ningún servidor escuchando ahora.',
      error: 'No pude leer la lista de servidores.',
      summary: (total, exposed) => `${total === 1 ? '1 servidor' : `${total} servidores`} · ${exposed ? `${exposed} visibles en tu red` : 'ninguno visible en tu red'}`,
      local: 'Solo esta computadora',
      network: 'Visible en tu red',
      unknownProcess: 'Proceso desconocido',
      exposedReason: 'Cualquier equipo de tu red WiFi puede abrir este servidor. Si no hace falta, arráncalo solo en localhost (127.0.0.1).',
      exposedReasonTech: (address) => `Escucha en ${address || 'todas las interfaces'}: accesible desde la red local. Arráncalo con host 127.0.0.1 si no necesitas acceso desde otros equipos.`,
      open: 'Abrir',
      openTitle: (port) => `Abrir http://localhost:${port} en un navegador`,
      openWith: 'Abrir con',
      openDefault: 'Navegador predeterminado',
      openOther: 'Elegir otra app…',
      more: (port) => `Más opciones del puerto ${port}`,
      stop: 'Detener…',
      stopTitle: (port) => `Detener el servidor del puerto ${port} (te pide confirmación)`,
      stopped: (port) => `Listo: se detuvo el servidor del puerto ${port}.`,
      pause: 'Pausar',
      resume: 'Reanudar',
      resumeTitle: (port) => `Reanudar el servidor del puerto ${port}`,
      pausedChip: 'En pausa',
      pausedReason: 'Está congelado: no responde hasta que lo reanudes, y el puerto sigue ocupado.',
      paused: (port) => `El servidor del puerto ${port} quedó en pausa. Platanus lo reanuda si se cierra.`,
      resumed: (port) => `El servidor del puerto ${port} volvió a correr.`,
      stoppedTitle: 'Detenidos desde Platanus',
      stoppedChip: 'Detenido',
      stoppedAt: (time) => `a las ${time}`,
      restart: 'Reactivar…',
      restartTitle: (port) => `Reactivar el servidor del puerto ${port} dentro de Platanus (te pide confirmación)`,
      restarted: (port) => `Iniciando el servidor del puerto ${port} dentro de Platanus…`,
      managedChip: 'En Platanus',
      managedTitle: 'Lo inició Platanus: corre dentro de la app y se detiene al cerrarla. Su salida está en ⋯ › Ver salida.',
      showOutput: 'Ver salida',
      closeOutput: 'Cerrar la salida',
      noOutput: 'Todavía no escribió nada.',
      outputLabel: (port) => `Salida del servidor del puerto ${port}`,
      startingChip: 'Iniciando…',
      startingDetail: (port) => `esperando el puerto ${port}`,
      exitedChip: 'Se cerró solo',
      exitedDetail: (code, time) => (code == null ? `a las ${time}` : `código ${code} · a las ${time}`),
      exitedReason: 'Se cerró sin que lo detuvieras. Abre su salida (⋯ › Ver salida) para ver por qué.',
      cancelStart: 'Cancelar inicio',
      cancelStartTitle: (port) => `Cancelar el inicio del servidor del puerto ${port}`,
      cannotRestart: 'No se puede reactivar desde aquí: vuelve a arrancarlo desde tu terminal.',
      forget: 'Quitar de la lista',
      working: 'Esperando…',
      actionFailed: 'No se pudo completar la acción.',
      dismiss: 'Cerrar aviso',
      demo: 'Ejemplo',
      demoNote: 'Estos servidores son de ejemplo. En la app de escritorio ves los de tu computadora.',
    },
    status: {
      noProject: 'Sin proyecto',
      counts: (red, yellow, green) => `${red} en riesgo · ${yellow} por revisar · ${green} seguros`,
      agent: 'Agente en línea',
    },
  },

  // View switcher on the map
  stageTabs: { map: 'Mapa', git: 'Git' },

  chat: {
    agentName: 'Agente Platanus',
    online: 'En línea',
    placeholder: 'Pregúntale al agente… (Enter envía, Shift+Enter salta línea)',
    placeholders: {
      vibe: 'Cuéntame qué necesitas, con tus palabras…',
      tech: 'Pregunta técnica: rutas, código, configuración… (Enter envía)',
    },
    // How the agent talks (agent/voice.json + agent/skills/)
    // Chat header: the connected agent's name, its model and effort (formal), or the demo / simulator
    header: {
      demo: { name: 'Agente de demostración', detail: 'Sin IA · respuestas de ejemplo' },
      sim: { name: 'Simulador', detail: 'Escenarios de prueba' },
      planModel: 'Modelo de tu plan',
      efforts: { low: 'Esfuerzo bajo', medium: 'Esfuerzo medio', high: 'Esfuerzo alto', xhigh: 'Esfuerzo muy alto', max: 'Esfuerzo máximo' },
    },
    voice: {
      label: 'Cómo te habla el agente',
      names: { vibe: 'Vibe', tech: 'Dev' },
      hints: {
        vibe: 'Vibe: palabras simples, comparaciones de la vida diaria y sin jerga.',
        tech: 'Dev: detalle técnico, rutas y fragmentos de código cortos.',
      },
      // Hover labels: what the button does, shown above it
      tips: {
        vibe: 'Vibe · te hablo simple, sin código',
        tech: 'Dev · te hablo técnico, con rutas y código',
      },
    },
    // "Mejorar mi mensaje" and the help while typing (renderer/viewmodels/composerViewModel.js)
    assist: {
      improve: 'Mejorar mi mensaje',
      improveTip: 'Mejorar mi mensaje · lo ordeno en pasos con su prueba para que el agente entienda qué quieres',
      improving: 'Ordenando tu mensaje…',
      undo: 'Deshacer',
      notices: {
        agent: 'Ordené tu mensaje en pasos, con la prueba primero. Revísalo y envíalo.',
        local: 'Lo ordené aquí mismo (sin el agente). Revísalo y envíalo.',
        empty: 'Escribe primero qué quieres; luego lo ordeno.',
      },
      hints: {
        short: 'Cuéntame un poco más: qué quieres que pase y dónde.',
        noTarget: (name) => (name ? `¿Te refieres a ${name}? Tócalo para agregarlo.` : 'Dime qué archivo: escribe @ y su nombre.'),
        secret: 'Parece una clave o contraseña. No la pegues aquí: dime solo dónde está.',
      },
      completionsLabel: 'Sugerencias para tu mensaje (Tab para elegir)',
      // Words that ask for an action on a file (to notice when the file is missing)
      actionWords: ['repara', 'arregla', 'corrige', 'revisa', 'audita', 'analiza', 'mira', 'cambia', 'mejora', 'explica', 'explícame', 'protege'],
      // The spec the message becomes, as the agent reads it (headings per mode)
      spec: {
        vibe: { objective: 'Qué quiero', problem: 'Por qué', scope: 'Dónde', constraints: 'Qué no tocar', tasks: 'Pasos', accept: 'Listo cuando', test: 'Primero la prueba', red: 'Antes (debe fallar)', green: 'Después (debe pasar)', refactor: 'Al final' },
        dev: { objective: 'Objetivo', problem: 'Problema', scope: 'Alcance', constraints: 'Restricciones', tasks: 'Tareas', accept: 'Acepta', test: 'TDD (RED → GREEN → REFACTOR)', red: 'RED', green: 'GREEN', refactor: 'REFACTOR' },
      },
      // Spec made here when no agent is connected
      local: {
        tasks: (target) => [
          { do: `Escribir una prueba que muestre el problema${target ? ` en ${target}` : ''}`, accept: 'La prueba falla antes del cambio' },
          { do: `Hacer el cambio más pequeño${target ? ` en ${target}` : ''} para que la prueba pase`, accept: 'La prueba pasa y las demás siguen pasando' },
          { do: 'Ordenar el código sin cambiar lo que hace', accept: 'Todas las pruebas siguen pasando' },
        ],
        red: 'Una prueba que hoy falla y muestra el problema',
        green: 'La misma prueba pasa con el cambio',
        refactor: 'El código queda ordenado y todas las pruebas pasan',
        constraints: ['No mostrar ni copiar claves o contraseñas', 'Cambiar solo lo necesario'],
      },
    },
    // What the orb in the agent's avatar says it is doing (screen readers)
    orbLabels: {
      thinking: 'Pensando…',
      writing: 'Escribiendo la respuesta…',
      working: 'Trabajando…',
      get_project: 'Mirando tu proyecto…',
      list_risks: 'Revisando los riesgos…',
      read_file: 'Leyendo un archivo…',
      write_file: 'Guardando un arreglo…',
      set_file_score: 'Actualizando el semáforo…',
      show_folder: 'Buscando la carpeta en el mapa…',
      subagent: 'Coordinando ayudantes…',
      repair: 'Arreglando un archivo…',
      improve: 'Ordenando tu mensaje…',
      connect: 'Probando la conexión…',
      approval: 'Esperando tu aprobación…',
    },
    thinking: 'Pensando…',
    reasoning: 'Cómo lo pensó',
    // Titles of the agent's cards when it gives none ("> [!riesgo]" ...)
    callouts: { danger: 'Riesgo', ok: 'Está bien', idea: 'Idea', step: 'Tu siguiente paso', info: 'Nota' },
    pin: 'Fijar el chat: el mapa le deja su espacio',
    unpin: 'Soltar el chat: vuelve a flotar sobre el mapa',
    resize: 'Arrastra para cambiar el ancho del chat',
    run: {
      tools: {
        get_project: 'Ver el proyecto',
        list_risks: 'Revisar los riesgos',
        read_file: 'Leer un archivo',
        write_file: 'Guardar un arreglo',
        set_file_score: 'Cambiar el semáforo',
        show_folder: 'Mostrar en el mapa',
      },
      tool: 'Usar una herramienta',
      subagent: (kind) => (kind ? `Subagente · ${kind}` : 'Subagente'),
      summary: (steps, subagents) => `${steps === 1 ? '1 paso' : `${steps} pasos`}${subagents ? ` · ${subagents === 1 ? '1 subagente' : `${subagents} subagentes`}` : ''}`,
      working: 'Trabajando…',
      queued: 'Esperando turno…',
      agentTitle: 'Agente',
      done: 'Listo',
      failed: 'Con error',
      seconds: (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`),
      foot: ({ durationMs, turns, inputTokens, outputTokens }, format) =>
        `${format(durationMs)} · ${turns === 1 ? '1 turno' : `${turns} turnos`} · ${(inputTokens + outputTokens).toLocaleString('es')} tokens`,
      output: 'Lo que respondió',
      // A file change shown live on its step (electron/lineDiff.js)
      diff: {
        proposed: 'Cambio propuesto',
        applied: 'Cambio aplicado',
        rejected: 'No aprobado',
        created: 'Archivo nuevo',
        counts: (added, removed) => `+${added} −${removed}`,
        more: 'Hay más cambios: abre el archivo para verlos completos.',
      },
    },
    // Modo Vibe: what the agent does, told as short sentences (renderer/models/runStory.js)
    story: {
      running: {
        get_project: () => 'Mirando tu proyecto…',
        list_risks: () => 'Buscando lo que está en riesgo…',
        read_file: (n) => `Leyendo ${n}…`,
        write_file: (n) => `Guardando el arreglo en ${n}…`,
        set_file_score: (n) => `Poniendo el semáforo de ${n}…`,
        show_folder: (n) => `Abriendo ${n} en el mapa…`,
      },
      done: {
        get_project: () => 'Miré tu proyecto',
        list_risks: () => 'Revisé lo que está en riesgo',
        read_file: (n) => `Leí ${n}`,
        write_file: (n) => `Guardé el arreglo en ${n}`,
        set_file_score: (n, color) => (color ? `Marqué ${n} en ${color}` : `Puse el semáforo de ${n}`),
        show_folder: (n) => `Te mostré ${n} en el mapa`,
      },
      // write_file of a file that did not exist
      created: (n) => `Creé ${n}`,
      // What the step was, for "No pude terminar: …"
      what: {
        get_project: () => 'mirar el proyecto',
        list_risks: () => 'revisar los riesgos',
        read_file: (n) => `leer ${n}`,
        write_file: (n) => `guardar ${n}`,
        set_file_score: (n) => `poner el semáforo de ${n}`,
        show_folder: (n) => `mostrar ${n}`,
      },
      failed: (what) => `No pude terminar: ${what}`,
      skipped: (what) => `No cambié nada (${what}): solo me pediste entender`,
      unknown: { running: 'Usando una herramienta de Platanus…', done: 'Usé una herramienta de Platanus', what: 'un paso' },
      helper: (description) => `Un ayudante: ${description}`,
      aFile: 'un archivo',
      theProject: 'tu proyecto',
      levels: { green: 'verde', yellow: 'amarillo', red: 'rojo' },
      thinking: 'Pensando qué hacer…',
      writing: 'Escribiendo la respuesta…',
      awaiting: (name) => `Esperando tu aprobación para guardar ${name}…`,
      recap: { files: (n) => `Leí ${n === 1 ? '1 archivo' : `${n} archivos`}`, level: (n, color) => `${n} en ${color}`, fixes: (n) => `guardé ${n === 1 ? '1 arreglo' : `${n} arreglos`}`, created: (n) => `creé ${n === 1 ? '1 archivo' : `${n} archivos`}`, steps: (n) => (n === 1 ? '1 paso' : `${n} pasos`) },
      doneIn: (time) => `Listo en ${time}`,
      failedRun: 'No pudo terminar',
      // The same change, in plain words
      diff: {
        proposed: 'Lo que va a cambiar',
        applied: 'Ver lo que cambió',
        rejected: 'No se guardó',
        counts: (added, removed) => `${added === 1 ? '1 línea nueva' : `${added} líneas nuevas`} · ${removed === 1 ? '1 quitada' : `${removed} quitadas`}`,
      },
    },
    welcomeTitle: (project) => `¿Qué hacemos con ${project}?`,
    welcomeNoProject: '¿Qué hacemos hoy?',
    welcomeBody: 'Cuéntame tu idea o pídeme que revise tu proyecto. Te digo qué estoy haciendo y te explico cada problema con palabras simples.',
    prompts: ['Revisa mi proyecto y dime qué está en riesgo', 'Explícame el mapa con palabras simples', '¿Qué archivo debería arreglar primero?'],
    // Shown above the box to start writing right away (they fill the box, the person can edit and send)
    followUps: {
      vibe: ['¿Mi app es segura?', 'Explícamelo más simple', '¿Qué hago ahora?', '¿Qué archivo arreglo primero?', '¿Por qué esto es un riesgo?'],
      tech: ['Revisa los archivos en rojo', 'Audita este proyecto a fondo', '¿Qué secretos están expuestos?', 'Revisa la autenticación', 'Propón el arreglo con código'],
    },
    followUpsTitle: 'Sugerencias para escribir',
    auditPrompt: (path, reason) => `Audita \`${path}\`.${reason ? ` El mapa lo marca así: "${reason}".` : ''} Léelo y dime si el riesgo es real o una falsa alarma, por qué, y qué haría para arreglarlo. Si no es un riesgo, ponlo en verde en el semáforo.`,
    notInProject: (path) => `No encuentro "${path}" en este proyecto.`,
    // Next steps the agent suggests (chips under its answer)
    suggest: {
      repair: (name) => `Reparar ${name}`,
      audit: (name) => `Auditar ${name}`,
      locate: (name) => `Ver ${name} en el mapa`,
      open: (name) => `Abrir ${name}`,
    },
    // Map events shown as cards in the chat
    cards: {
      files: (n) => (n === 1 ? '1 archivo' : `${n} archivos`),
      folders: (n) => (n === 1 ? '1 subcarpeta' : `${n} subcarpetas`),
      levels: { red: 'en riesgo', yellow: 'a revisar', green: 'seguros' },
      folderHint: 'No tiene problemas. Su contenido está junto a la carpeta en el mapa.',
      folderHintRisk: 'Lo que brilla en ámbar o rojo tiene problemas. Está junto a la carpeta en el mapa: toca un archivo para ver el motivo.',
      folderEmpty: 'Todavía no tiene archivos.',
      seeRisks: 'Ver los riesgos',
      explainFolder: 'Explícame esta carpeta',
      explainFolderPrompt: (name) => `Explícame qué hay en la carpeta \`${name.replace(/\/$/, '')}\` y para qué sirve, con palabras simples.`,
      whatIsIt: '¿Qué es este archivo?',
      whatIsItPrompt: (path) => `¿Qué es \`${path}\` y para qué sirve en mi proyecto? Explícamelo con palabras simples.`,
      openBrowser: 'Abrir en el navegador',
      notReviewed: 'Nadie lo ha revisado todavía. Puedo revisarlo si quieres.',
      // Modo Vibe: what a file is, in plain words (renderer/models/fileOpen.js -> fileKind)
      kinds: {
        page: 'Una página web: lo que ve la gente al abrirla',
        styles: 'Colores, tamaños y formas de la pantalla',
        code: 'Instrucciones que hacen funcionar tu app',
        test: 'Una prueba que revisa que nada se rompa',
        settings: 'Ajustes de cómo se instala o se publica tu app',
        data: 'Datos guardados en una lista o tabla',
        text: 'Un texto con explicaciones',
        image: 'Una imagen',
        document: 'Un documento',
        script: 'Pasos que la computadora ejecuta sola',
        secret: 'Guarda claves o contraseñas',
        other: 'Un archivo del proyecto',
      },
      where: (place) => `En «${place}»`,
      short: { open: 'Abrir', ask: 'Explícamelo', audit: 'Revisar', repair: 'Reparar', locate: 'En el mapa' },
      reviewIt: 'Revisar este archivo',
      reveal: 'Mostrar en la carpeta',
      onMap: 'Ver en el mapa',
      openFailed: 'No pude abrir el archivo.',
      // The first lines of a file opened from the chat
      preview: {
        loading: 'Leyendo el archivo…',
        secret: 'Este archivo guarda claves o contraseñas: no lo muestro en el chat.',
        binary: 'Es una imagen u otro archivo que no es texto.',
        error: 'No pude leer el archivo.',
        more: (n) => (n === 1 ? '1 línea más' : `${n} líneas más`),
        label: (name) => `Primeras líneas de ${name}`,
      },
      changes: (n) => (n === 1 ? 'Se guardó un cambio' : `Se guardaron cambios en ${n} archivos`),
      changesMore: (n) => `y ${n} más`,
      audit: 'Auditar en el chat',
      source: 'Quién lo marcó',
    },
    more: 'Más opciones',
    menu: {
      open: 'Abrir el chat',
      connect: 'Conecta tu agente',
      editor: 'Conectar tu editor (MCP)',
      repairWorst: 'Reparar el riesgo más grave',
      history: 'Historial de reparaciones',
      mode: (tech) => (tech ? 'Hablar en modo Vibe' : 'Hablar en modo Dev'),
      newChat: 'Nueva conversación',
      // The redesigned menu: a header with the state, tiles with an icon, a foot
      working: 'Trabajando…',
      allGreen: 'Todo en verde',
      risk: (n) => `${n} en riesgo`,
      review: (n) => `${n} por revisar`,
      agentless: 'Agente de demostración',
      repairFile: (name) => `Reparar ${name}`,
      historyShort: 'Reparaciones',
      connectAgents: 'Conectar agentes',
      openShort: 'Abrir',
      modeShort: (tech) => (tech ? 'Modo Vibe' : 'Modo Dev'),
    },
    connectors: 'Conexiones: conecta tu IA o tu editor',
    pickerTitle: 'Quién responde',
    pickerMore: 'Conectar desde tu editor…',
    // The agent menu of the composer (renderer/views/ui/agentPickerView.js)
    picker: {
      agent: 'Agente',
      demo: 'Demostración',
      demoNote: 'Sin IA',
      viaLogin: 'Con tu suscripción',
      viaKey: (last4) => `Con clave de API ··${last4}`,
      notConnected: 'Sin conectar',
      unknown: 'Por comprobar',
      connect: 'Conectar',
      connectHint: 'Conectar con tu suscripción o con una clave de API',
      login: 'Iniciar sesión con mi cuenta',
      useKey: 'Usar una clave de API',
      replaceKey: 'Cambiar la clave de API',
      removeKey: 'Quitar la clave guardada',
      keyLabel: (name) => `Clave de API de ${name}`,
      keyPlaceholder: { claude: 'Pega tu clave (sk-ant-…)', codex: 'Pega tu clave (sk-…)', grok: 'Pega tu clave (xai-…)' },
      saveKey: 'Guardar',
      keyNote: 'Se guarda cifrada en tu computadora y no se vuelve a mostrar.',
      keyErrors: {
        shape: 'Esa clave no tiene el formato de este servicio. Revisa que la copiaste completa.',
        'no-keychain': 'Tu sistema no permite guardarla cifrada; no la guardé.',
        unknown: 'Este agente no acepta claves de API.',
        failed: 'No pude guardar la clave.',
      },
      more: 'Más opciones',
      moreHint: (model, effort) => `${model} · ${effort}`,
      hub: 'Más formas de conectar…',
      others: 'Otros agentes',
      moreAgents: (n) => `Ver más agentes · ${n}`,
      external: { cursor: 'Cursor', kimi: 'Kimi', gemini: 'Gemini', qwen: 'Qwen Code', opencode: 'OpenCode' },
      fromApp: 'Desde su app',
      how: (file) => `Trabaja desde su propia app, usando solo las herramientas de Platanus. Pega esto en ${file}:`,
      installHint: 'Si no lo tienes, instálalo con:',
      mcpOff: 'Abre un proyecto para poder conectarlo.',
      copy: 'Copiar',
      copied: 'Copiado',
      opencodeKeys: 'Usa la clave que guardes en Claude, ChatGPT o Grok.',
    },
    // Agent permissions (renderer/models/approvalModel.js, rules in electron/approval.js)
    permissions: {
      label: 'Permisos del agente',
      names: { manual: 'Manual', auto: 'Auto', bypass: 'Sin preguntar' },
      notes: {
        manual: 'Te pregunto antes de guardar cada cambio.',
        auto: 'Guardo solo los cambios simples. Te pregunto los delicados: instalación, publicación, scripts o borrar casi todo un archivo.',
        bypass: 'Guardo todo sin preguntarte. Siempre queda una copia para deshacer y nunca toco claves.',
      },
      status: (name) => `Cambios: ${name}`,
    },
    demo: 'Demo',
    inputLabel: 'Mensaje',
    send: 'Enviar',
    minimize: 'Minimizar',
    expand: 'Abrir',
    ariaLabel: 'Chat con el agente',
    toolUsed: (name) => ({
      get_project: 'Mirando tu proyecto…',
      list_risks: 'Revisando los archivos en riesgo…',
      read_file: 'Leyendo un archivo…',
      set_file_score: 'Actualizando el semáforo en el mapa…',
      show_folder: 'Mostrándote una carpeta en el mapa…',
    })[String(name).replace(/^(?:mcp__)?platanus(?:__|_)?(?:platanus_)?/, '')] ?? 'Usando una herramienta…',

    greeting: '¡Hola! 👋 Soy el agente de seguridad. Abre un proyecto para empezar.',
    projectReady: 'Listo, ya veo tu proyecto en el mapa. ¿Qué hacemos?',
    projectOpened: (name) => `Proyecto abierto: ${name}`,
    projectClosed: (name) => `Proyecto cerrado: ${name}`,
    // Sent to the agent before a question asked while the robot is on a place (the person does not see it)
    contextNote: ({ title, path }) => `(La persona tiene al robot de Platanus en ${path ? `«${path}» (${title})` : `la plaza del proyecto «${title}»`}; si dice "aquí", se refiere a ese lugar.)`,
    // Sent to the agent before a question to understand (the person does not see it)
    explainNote: '(La persona solo quiere entender: explícalo con palabras simples. No cambies archivos ni propongas reparaciones, salvo que lo pida.)',
    // The place on top of the chat, on the question and on its answer
    focus: { label: 'El robot está en', about: 'Sobre', close: 'Dejar de hablar de este lugar', project: 'Todo el proyecto' },
    projectCreated: (name) => `Listo, creé «${name}» y está vacío 🌱\nCuéntame qué quieres construir y lo armamos juntos, de forma segura desde el primer archivo.`,
    projectCreateFailed: (error) => `No pude crear el proyecto: ${error}`,
    diskChanged: (paths) => `Cambios en disco: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ` y ${paths.length - 3} más` : ''}`,

    chips: {
      openFolder: 'Abrir carpeta',
      suggestions: ['Escanear edificio', 'Ver accesos', 'Simular ataque'],
      vulnerability: ['Ver detalles', 'Corregir ahora'],
      fixNow: 'Corregir ahora',
    },

    folderOpened: ({ name, files: fileCount, folders: folderCount, counts }) => {
      const head = `📂 ${name} · ${files(fileCount)} · ${plural(folderCount, 'subcarpeta', 'subcarpetas')}`;
      if (!fileCount) return `${head}\n\nTodavía no tiene archivos.`;
      const summary = `🔴 ${counts.red} en riesgo · 🟡 ${counts.yellow} a revisar · 🟢 ${counts.green} seguros`;
      const hint = counts.red + counts.yellow
        ? 'Su contenido está junto a la carpeta en el mapa: lo que brilla tiene problemas. Haz clic en un archivo para ver el motivo.'
        : 'No tiene problemas. Su contenido está junto a la carpeta en el mapa.';
      return `${head}\n${summary}\n\n${hint}`;
    },
    fileSelected: ({ path, levelText, reason, source }) => `📄 ${path}\n${levelText} · ${reason}\n\n${source}`,
    tableExposed: (name, exposed) =>
      `<strong>⚠ Tabla ${name}: RLS desactivado</strong>\nColumnas expuestas: ${exposed}.\nCualquiera con la anon key puede leerlas.`,
    tableOk: (name, columnCount, keys) => `Tabla ${name} ✅\n${columnCount} columnas · claves: ${keys}\nRLS activo, sin problemas.`,
  },

  // Scripted agent (demo). Keywords are matched against the start of each word.
  connect: {
    title: 'Conecta tu agente',
    rail: 'Conecta tu agente',
    intro: 'Usa tu propia suscripción de IA. Platanus no ve tus contraseñas ni claves: cada programa inicia sesión por su cuenta.',
    subscriptions: 'Tus suscripciones',
    none: 'No encontré Claude Code, Grok ni Codex instalados en esta computadora.',
    desktopOnly: 'Disponible en la app de escritorio.',
    scripted: 'Agente de demostración (sin IA)',
    use: 'Usar',
    inUse: 'En uso',
    login: 'Entrar',
    loggedIn: 'sesión iniciada',
    loggedOut: 'sin sesión',
    unknownLogin: 'sesión por comprobar',
    model: 'Modelo',
    planDefault: 'El de tu plan',
    effort: 'Cuánto piensa',
    efforts: { low: 'Rápido', medium: 'Equilibrado', high: 'Profundo', xhigh: 'Muy profundo', max: 'Máximo' },
    modelNotes: {
      plan: 'El que elige tu plan',
      best: 'El más capaz',
      deep: 'Profundo y preciso',
      balanced: 'Rápido y capaz',
      fast: 'El más rápido',
      newest: 'El más nuevo',
      fastPricey: 'Más rápido, gasta más',
      previous: 'Versión anterior',
    },
    effortHints: {
      low: 'Responde al instante. Ideal para preguntas cortas.',
      medium: 'Piensa un poco más antes de responder.',
      high: 'Revisa con calma: mejor para auditar.',
      xhigh: 'Análisis a fondo; tarda más.',
      max: 'Todo el razonamiento disponible. Lento y más caro para tu plan.',
    },
    fromEditor: 'Conéctalo desde tu editor',
    fromEditorIntro: 'Copia esto en tu herramienta para que trabaje con el mapa de Platanus mientras la app está abierta.',
    mcpOff: 'El servidor local todavía no está listo.',
    mcpOn: (url) => `Servidor local: ${url}`,
    mcpPrivate: 'La dirección lleva una llave privada (oculta aquí). "Copiar" la incluye: no la compartas.',
    copy: 'Copiar',
    copied: 'Copiado',
    snippets: {
      claude: 'Claude Code (terminal)',
      cursor: 'Cursor (.cursor/mcp.json)',
      codex: 'Codex (~/.codex/config.toml)',
      gemini: 'Gemini CLI (~/.gemini/settings.json)',
      kimi: 'Kimi Code (~/.kimi-code/mcp.json)',
      qwen: 'Qwen Code (~/.qwen/settings.json)',
      opencode: 'OpenCode (opencode.json)',
    },
  },

  // "Conecta tu agente" panel: agents, comparing answers, the local MCP server and its activity
  hub: {
    agents: 'Tus agentes',
    version: (v) => (v ? `v${v.replace(/^v/, '')}` : ''),
    path: 'Ruta',
    test: 'Probar',
    testing: 'Probando…',
    testOk: (ms) => `Responde en ${(ms / 1000).toFixed(1)} s`,
    testFailed: 'No respondió',
    testHint: 'Envía un mensaje mínimo (usa unos pocos tokens de tu plan).',
    stats: ({ runs, tokens, lastUsedAt }) => {
      const t = tokens >= 1000 ? `${Math.round(tokens / 1000)} mil tokens` : `${tokens} tokens`;
      const when = lastUsedAt ? ` · ${strings.hub.ago(Date.now() - lastUsedAt)}` : '';
      return `${runs === 1 ? '1 respuesta' : `${runs} respuestas`} · ${t}${when}`;
    },
    never: 'Todavía no lo usaste',
    lastError: 'Último error',
    current: (model, effort) => `${model} · ${effort}`,
    compare: 'Comparar respuestas',
    compareIntro: 'Pregunta a dos agentes a la vez y compara lo que responden.',
    compareNone: 'Solo uno',
    server: 'Servidor local (MCP)',
    running: 'Encendido',
    stopped: 'Apagado',
    tools: 'Herramientas que ofrece',
    toolInfo: {
      get_project: 'Ve las carpetas y archivos del proyecto abierto.',
      list_risks: 'Lista los archivos en rojo o amarillo y por qué.',
      read_file: 'Lee un archivo (nunca secretos ni archivos de más de 200 KB).',
      write_file: 'Guarda un arreglo: siempre te pide permiso y guarda copia.',
      set_file_score: 'Cambia el semáforo de un archivo en el mapa.',
      show_folder: 'Te muestra una carpeta en el mapa.',
    },
    activity: 'Actividad reciente',
    activityEmpty: 'Todavía ningún agente usó Platanus.',
    ago: (ms) => {
      const s = Math.max(1, Math.round(ms / 1000));
      return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
    },
    testPrompt: 'Responde solo con la palabra: listo',
    compareLabel: (a, b) => `Comparando ${a} y ${b}`,
  },

  agent: {
    // The chat agent's own instructions live in agent/voice.json and agent/skills/ (not shown to people)
    liveStopped: (why) => `<strong>Tu agente se detuvo antes de terminar.</strong> ${why} Lo que alcanzó a decir queda arriba; puedes volver a preguntar.`,
    liveFailed: (why) => `<strong>No pude hablar con tu agente.</strong> ${why || 'Revisa en "Conecta tu agente" que la sesión esté iniciada.'}`,
    replies: [
      { keys: ['hola', 'buenas', 'hey'], text: '¡Hola! Soy el agente de seguridad del HQ. Puedo escanear el edificio, revisar accesos o explicarte una amenaza.' },
      { keys: ['escan', 'scan', 'revisa'], text: 'Escaneando la torre principal…\n\n✔ 18 ventanas monitoreadas\n✔ Antena: señal estable\n⚠ 1 puerto abierto en el anexo (servidor 2)\n\n¿Quieres que lo cierre?' },
      { keys: ['si', 'sí', 'cierra', 'ok', 'dale'], text: 'Listo, cerré el puerto del servidor 2 y dejé un registro del cambio. El edificio está en verde ✅' },
      { keys: ['acceso', 'login', 'entrada', 'puerta'], text: 'Últimos accesos a la puerta principal:\n• 09:12 — Ana (credencial válida)\n• 09:40 — Bot desconocido (bloqueado)\n• 10:05 — Luis (credencial válida)' },
      { keys: ['inyec', 'prompt', 'jailbreak'], text: 'Un prompt injection es cuando alguien esconde instrucciones dentro de un texto para que el modelo ignore sus reglas. Yo filtro esos mensajes antes de que lleguen al modelo.' },
      { keys: ['amenaza', 'ataque', 'riesgo'], text: 'Ahora mismo veo 0 ataques activos y 3 intentos bloqueados en la última hora. Nivel de riesgo: bajo 🟢' },
      { keys: ['gracias'], text: '¡Con gusto! Aquí sigo vigilando 👀' },
    ],
    fallback: 'Mmm, todavía estoy aprendiendo eso. Prueba con "escanear", "accesos" o "amenazas".',
    keywords: {
      fix: ['correg', 'corrig', 'corrij', 'arregl', 'soluc', 'fix', 'parche'],
      details: ['detalle', 'supabase', 'rls', 'vulnera'],
      attack: ['simula', 'ataca', 'hackea'],
    },
    vulnerability: {
      alert: '<strong>⚠ Vulnerabilidad detectada en Supabase</strong>\nLa tabla <b>users</b> tiene RLS (Row Level Security) desactivado. Cualquiera con la anon key puede leer correos y datos personales.\n\nEstoy viendo datos saliendo del nodo en rojo.\n\nHaz clic en el nodo de Supabase para ver tus tablas.',
      details: 'Detalles del hallazgo:\n• Tabla: public.users\n• Riesgo: CRÍTICO\n• Filas expuestas: 1.284\n• Petición sospechosa: GET /rest/v1/users?select=* desde 185.220.101.7\n\nRecomiendo activar RLS y crear una política para que cada usuario solo lea su propia fila.',
      fix: 'Aplicando corrección…\n\nALTER TABLE users ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "solo_su_fila" ON users\n  FOR SELECT USING (auth.uid() = id);\n\n✅ Listo. Bloqueé la IP sospechosa y el nodo vuelve a estar en verde.',
      nothingToFix: 'No hay nada que corregir ahora mismo, Supabase está en verde 🟢',
      attack: 'Ok, simulo un ataque contra el nodo de Supabase. Mira el mapa 👀',
      needsProject: 'Primero abre un proyecto para poder simular un ataque.',
    },
    files: {
      patterns: {
        openFolder: /^(abr[ei]r?|elegir|elige)\s+(una\s+)?carpeta$/i,
        mkdir: /^crea(r)?\s+(una\s+)?carpeta\s+(.+)$/i,
        write: /^crea(r)?\s+(un\s+)?archivo\s+(\S+)(?:\s+con\s+([\s\S]+))?$/i,
        remove: /^(borra|elimina)(r)?\s+(.+)$/i,
        list: /^(lista(r)?|ver|muestra(me)?)\s+(los\s+)?archivos$|^archivos$/i,
      },
      opened: (name) => `📂 Trabajando en "${name}".\nPrueba: "crea carpeta src" o "crea archivo src/app.js".`,
      notOpened: 'Ok, no abrí ninguna carpeta.',
      created: (path) => `📁 Carpeta creada: ${path}`,
      written: (path) => `📄 Archivo creado: ${path}`,
      removed: (path) => `🗑 Borrado: ${path}`,
      emptyFolder: 'La carpeta está vacía.',
      desktopOnly: 'Eso solo funciona dentro de la app de escritorio (npm start).',
      needsFolder: 'Primero elige una carpeta de trabajo: escribe "abrir carpeta".',
      failed: (error) => `<strong>⛔ No se pudo</strong>\n${error}`,
    },
    // Git commands understood in the chat. The phrasing is interpreted by models/gitIntent.js
    // (natural language → intent); these are only the replies.
    git: {
      help: 'Puedo ejecutar git con frases normales. Ejemplos:\n• "haz un commit que se llame arreglo login"\n• "deshaz el último commit" (rollback)\n• "reset al commit abc1234" (destructivo: necesito el SHA)\n• "crea una rama para pagos"\n• "cámbiate a main"',
      explain: {
        commit: 'Un commit es una foto guardada de tu proyecto. Dime "haz un commit que se llame ...".',
        rollback: 'Rollback (revert) crea un commit NUEVO que deshace otro, sin borrar el historial. Es seguro en equipo. Dime "deshaz el último commit".',
        reset: 'Reset mueve el proyecto a un commit anterior y descarta todo lo posterior. Es destructivo. Dime "reset al commit <sha>".',
        branch: 'Una rama es una línea paralela de trabajo para probar cosas sin tocar la principal. Dime "crea una rama para pagos".',
        diff: 'Rollback crea un commit nuevo que deshace otro: el historial se conserva. Reset mueve el historial hacia atrás y descarta cambios: es destructivo, úsalo solo en local.',
      },
      desktopOnly: 'Los comandos git solo funcionan dentro de la app de escritorio (npm start).',
      needsMessage:  'Escríbeme el mensaje del commit. Ejemplo: "haz commit con \"Fix login bug\""',
      needsSha:       'Necesito el SHA del commit (al menos 4 caracteres). Puedes hacer clic en un commit del mapa y usar el chip que aparece aquí.',
      needsBranchName: 'Escribe el nombre de la rama. Ejemplo: "crea rama feature/mi-funcion"',
      cancelled:      'Ok, no hice ningún cambio.',
      committed:   (msg) => `✅ Commit creado:\n"${msg}"`,
      reverted:    (sha) => `↩️ Revert aplicado al ${sha === 'HEAD' ? 'último commit' : `commit ${sha.slice(0, 7)}`}.\nSe creó un nuevo commit que deshace esos cambios.`,
      reset:       (sha) => `⏮ HEAD movido al commit ${sha.slice(0, 7)}.\nLos cambios no guardados fueron descartados.`,
      branchCreated: (name) => `🌿 Rama "${name}" creada y activada.`,
      checkedOut:    (target) => `🔀 Cambiado a "${target}".`,
      failed:        (err) => `<strong>⛔ Error git</strong>\n${err}`,
      // Chips shown in the chat when the user selects a commit on the map
      chipRevert:   (short) => `Rollback · ${short}`,
      chipReset:    (short) => `Reset al ${short}`,
      chipCopySha:  'Copiar SHA',
    },
  },
};
