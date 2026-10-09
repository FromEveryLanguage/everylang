export type SupportedLocale = 'en' | 'fr' | 'ht' | 'es';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'fr', 'ht', 'es'];

/** Maps internal language identifiers (from configAtoms.languages) to BCP 47 codes */
export const LANGUAGE_BCP47: Record<string, string> = {
  'French': 'fr',
  'Haitian Creole': 'ht',
  'Spanish': 'es',
};

export interface AppStrings {
  // Connection status
  connecting: string;
  disconnected: string;

  // Component headers
  translation: string;
  bilingual: string;

  // Home page

  // Layout names
  layoutEverything: string;

  // Font size controls
  decreaseFontSize: string;
  increaseFontSize: string;

  // TTS
  autoSpeak: string;
  tapToSpeak: string;
  disableAutoTTS: string;
  enableAutoTTS: string;
  ttsError: string;

  // Bilingual viewer
  noContent: string;
  notTranslated: string;

  // Stick-to-bottom scrolling (BilingualBlockViewer, LiveTranscript)
  jumpToLatest: string;

  // Live transcript: label on the break shown for a long silence
  transcriptPause: string;

  // Slide viewer
  noSlides: string;
  waitingForProclaim: string;
  isProclaimRunning: string;
  previous: string;
  next: string;
  untitledPresentation: string;

  // Live audio translation (Gemini Live + LiveKit)
  listenLive: string;
  stopAudio: string;
  sourceTranscript: string;
  spokenLanguage: string;
  liveListening: string;
  waitingForSpeaker: string;
  restartingTranslation: string;
  waitingForTranscript: string;
  waitingForSpeech: string;
  liveAudioError: string;
  retry: string;
  broadcast: string;
  startBroadcast: string;
  listeners: string;
  activeTranslations: string;
  noActiveTranslations: string;
  broadcastEditorOnly: string;
  listenOriginal: string;
  favorites: string;
  allLanguages: string;
  micLevel: string;

  // Navigation
  goHome: string;
  downloadSession: string;

  // Write authorization (shared device keys)
  editorAccessDenied: string;
  dismiss: string;
  enterWriteKey: string;
  statusWriteKeyTitle: string;
  statusWriteKeyDescription: string;
  statusWriteKeyInstalled: string;
  statusWriteKeyMissing: string;
  statusWriteKeyPlaceholder: string;
  statusWriteKeySave: string;
  statusWriteKeyClear: string;

  // Which session we are in (#111): the gate before anything mounts, and the operator
  // control that overrides it.
  sessionResolving: string;
  sessionUnreachableTitle: string;
  sessionUnreachableBody: string;
  statusSessionTitle: string;
  statusSessionDescription: string;
  statusSessionSourcePin: string;
  statusSessionSourceProposal: string;
  statusSessionSourceDate: string;
  statusSessionSetBy: string;
  statusSessionLapses: string;
  statusSessionPin: string;
  statusSessionClearPin: string;
  statusSessionPlaceholder: string;
  statusSessionFailed: string;
  statusWritersTitle: string;
  statusWritersEmpty: string;
  statusWritersElsewhere: string;

  // Status / admin page (skeleton for #72)
  statusTitle: string;
  statusHealthTitle: string;
  statusHealthPlaceholder: string;
  statusNotReporting: string;
  statusCanaryTitle: string;
  statusCanaryPlaceholder: string;
  statusExportTitle: string;
  statusExportDescription: string;
  statusTranscriptsTitle: string;
  statusTranscriptsEmpty: string;
  statusTranscriptSource: string;
  statusTranscriptNoUpdates: string;
  statusUpdatePending: string;

  // Layout diagram component labels

  // Slide translation review
  slideReviewTitle: string;
  loadOnAirItem: string;
  reTranslate: string;
  reTranslating: string;
  notTranslatedYet: string;
  // "Reference" covers any canonical lookup the agent makes — Scripture, creeds, confessions.
  referenceCheckHeader: string;
  referenceCheckLegend: string;
  referenceCheckCanonical: string;
  referenceCheckAgent: string;
  referenceCheckSimilarityTitle: string;
  save: string;
  saveAll: string;
  saving: string;
  statusReviewed: string;
  statusUnsaved: string;
  reviewSourceHeader: string;
  noSlidesToReview: string;
  editorOnlyReview: string;
  reviewSlidesLink: string;
  unreviewedBadge: string;
  conversationHeader: string;
  noConversation: string;
  followUpPlaceholder: string;
  sendMessage: string;
  selectItemLabel: string;
  sourceChangedWarning: string;
  agentThinking: string;
  // Landing page (issue #133). Card subtitles render in the *card's* language, not the
  // page's, so a Spanish speaker on an English phone reads "Diapositivas…" under Español.
  landingTagline: string;
  landingCardSource: string;
  landingCardSlidesAndAudio: string;
  /** `{lang}` is the stand-in audio language, named in this locale. */
  landingCardSlidesStandInAudio: string;
  landingCardSlidesOnly: string;
  landingCardAudioOnly: string;
  landingAnotherLanguage: string;
  landingBack: string;
  landingSearch: string;
  /** `{langs}` is the slide-translation languages, named in this locale. */
  landingAudioOnlyFootnote: string;
  landingHeadphones: string;
  landingNotesTitle: string;
  landingTeam: string;
}

export const strings: Record<SupportedLocale, AppStrings> = {
  en: {
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    translation: 'Translation',
    bilingual: 'Bilingual',
    layoutEverything: 'Everything',
    decreaseFontSize: 'Decrease font size',
    increaseFontSize: 'Increase font size',
    autoSpeak: '⏸️ Auto-Speak',
    tapToSpeak: '▶️ Tap to Speak',
    disableAutoTTS: 'Disable auto text-to-speech',
    enableAutoTTS: 'Enable auto text-to-speech',
    ttsError: 'Error: ',
    noContent: 'No content yet',
    notTranslated: '(not translated)',
    jumpToLatest: '↓ New',
    transcriptPause: 'Pause',
    listenLive: 'Listen live',
    stopAudio: 'Stop audio',
    sourceTranscript: 'Source transcript',
    spokenLanguage: 'Spoken language',
    liveListening: 'Listening live',
    waitingForSpeaker: 'Waiting for the speaker…',
    restartingTranslation: 'Restarting translation…',
    waitingForTranscript: 'Waiting for the transcript…',
    waitingForSpeech: 'Waiting for translated speech…',
    liveAudioError: 'Live audio unavailable',
    retry: 'Retry',
    broadcast: 'Broadcast',
    startBroadcast: 'Start broadcasting',
    listeners: 'listeners',
    activeTranslations: 'Active translations',
    noActiveTranslations: 'None yet — listeners can request them',
    broadcastEditorOnly: 'Broadcasting is available in editor mode (#editor).',
    listenOriginal: 'Original',
    favorites: 'Favorites',
    allLanguages: 'All languages',
    micLevel: 'Mic level',
    noSlides: 'No slides available',
    waitingForProclaim: 'Waiting for Proclaim data...',
    isProclaimRunning: 'Is the Proclaim service running?',
    previous: 'Previous',
    next: 'Next',
    untitledPresentation: 'Untitled Presentation',
    goHome: 'Go home',
    editorAccessDenied: 'This device is not set up to edit. Showing the session read-only.',
    dismiss: 'Dismiss',
    enterWriteKey:
      'This device needs a write key to edit. Paste it here, or cancel to continue read-only.',
    statusWriteKeyTitle: "This device's write key",
    statusWriteKeyDescription:
      'Authorizes editing, the microphone, and translation from this device. Keys are per device, not per person.',
    statusWriteKeyInstalled: 'Key installed',
    statusWriteKeyMissing: 'No key on this device',
    statusWriteKeyPlaceholder: 'Paste a write key',
    statusWriteKeySave: 'Save',
    statusWriteKeyClear: 'Clear',
    downloadSession: 'Download session',
    sessionResolving: 'Finding the current session…',
    sessionUnreachableTitle: 'Can’t reach the server',
    sessionUnreachableBody:
      'The server decides which session is live, so there is nothing to show until it answers. Check the connection and retry, or put ?doc=doc-YYYY-MM-DD in the address to pick a session yourself.',
    statusSessionTitle: 'Current session',
    statusSessionDescription:
      'Every screen and every service reads this. Pin a document to override what the server would otherwise choose; the pin lapses on its own by the next morning.',
    statusSessionSourcePin: 'Pinned',
    statusSessionSourceProposal: 'Proposed by the presentation service',
    statusSessionSourceDate: 'Today’s date',
    statusSessionSetBy: 'set by',
    statusSessionLapses: 'lapses',
    statusSessionPin: 'Pin',
    statusSessionClearPin: 'Clear pin',
    statusSessionPlaceholder: 'doc-YYYY-MM-DD',
    statusSessionFailed: 'Could not change the pin',
    statusWritersTitle: 'Who is writing where',
    statusWritersEmpty: 'Nothing has asked to write in the last 15 minutes.',
    statusWritersElsewhere: 'writing to a different session',
    statusTitle: 'Session status',
    statusHealthTitle: 'Component health',
    statusHealthPlaceholder: 'Live component heartbeats will appear here.',
    statusNotReporting: 'Not yet reporting',
    statusCanaryTitle: 'Preflight canary',
    statusCanaryPlaceholder: 'A pre-service end-to-end check will run here.',
    statusExportTitle: 'Session export',
    statusExportDescription:
      'Download this session’s notes, slide translations, and live transcripts as a single readable HTML file.',
    statusTranscriptsTitle: 'Live transcripts',
    statusTranscriptsEmpty: 'No live transcripts in this session yet.',
    statusTranscriptSource: 'source',
    statusTranscriptNoUpdates: 'No updates since page load',
    statusUpdatePending: 'Update pending — restart the service',
    slideReviewTitle: 'Slide Translation Review',
    loadOnAirItem: 'Load on-air item',
    reTranslate: 'Re-translate',
    reTranslating: 'Re-translating…',
    notTranslatedYet: 'Not translated yet — use Re-translate to draft this item.',
    referenceCheckHeader: 'Reference check',
    referenceCheckLegend:
      'Struck-through red is the published wording the translation dropped or changed; green is the translation’s own wording.',
    referenceCheckCanonical: 'Published reference text',
    referenceCheckAgent: 'Translation’s wording',
    referenceCheckSimilarityTitle: 'How much of the published wording the translation kept',
    save: 'Save',
    saveAll: 'Save all reviewed',
    saving: 'Saving…',
    statusReviewed: 'Reviewed',
    statusUnsaved: 'Unsaved',
    reviewSourceHeader: 'Source',
    noSlidesToReview: 'Select a service item, or load the on-air item, to review its slides.',
    editorOnlyReview: 'Open this page with #editor to edit and save translations.',
    reviewSlidesLink: 'Review Slide Translations',
    unreviewedBadge: 'unreviewed',
    conversationHeader: 'Agent conversation',
    noConversation: 'No conversation yet — Re-translate to start one.',
    followUpPlaceholder: 'Ask a question or give feedback…',
    sendMessage: 'Send',
    selectItemLabel: 'Service item',
    sourceChangedWarning: 'Source slides changed since this was translated.',
    agentThinking: 'Agent is working…',
    landingTagline: 'Live translation for today\'s service. Pick your language.',
    landingCardSource: 'Read along, or listen',
    landingCardSlidesAndAudio: 'Slides and live audio',
    landingCardSlidesStandInAudio: 'Slides, with audio in {lang}',
    landingCardSlidesOnly: 'Slides only',
    landingCardAudioOnly: 'Live audio and transcript',
    landingAnotherLanguage: 'Another language',
    landingBack: 'Back',
    landingSearch: 'Search',
    landingAudioOnlyFootnote: 'Live audio and transcript only — slides are translated into {langs}.',
    landingHeadphones: 'Audio is optional: the transcript appears on its own. To listen, use headphones.',
    landingNotesTitle: 'Sermon notes',
    landingTeam: 'Team',
  },
  fr: {
    connecting: 'Connexion\u2026',
    disconnected: 'D\u00e9connect\u00e9',
    translation: 'Traduction',
    bilingual: 'Bilingue',
    layoutEverything: 'Tout',
    decreaseFontSize: 'Diminuer la taille du texte',
    increaseFontSize: 'Augmenter la taille du texte',
    autoSpeak: '\u23f8\ufe0f Parole auto',
    tapToSpeak: '\u25b6\ufe0f Appuyer pour parler',
    disableAutoTTS: 'D\u00e9sactiver la synth\u00e8se vocale automatique',
    enableAutoTTS: 'Activer la synth\u00e8se vocale automatique',
    ttsError: 'Erreur\u00a0: ',
    noContent: 'Aucun contenu pour l\u2019instant',
    notTranslated: '(non traduit)',
    jumpToLatest: '\u2193 Nouveau',
    transcriptPause: 'Pause',
    listenLive: 'Écouter en direct',
    stopAudio: 'Couper le son',
    sourceTranscript: 'Transcription source',
    spokenLanguage: 'Langue parlée',
    liveListening: 'Écoute en direct',
    waitingForSpeaker: 'En attente de l’orateur…',
    restartingTranslation: 'Redémarrage de la traduction…',
    waitingForTranscript: 'En attente de la transcription…',
    waitingForSpeech: 'En attente de la traduction vocale…',
    liveAudioError: 'Audio en direct indisponible',
    retry: 'Réessayer',
    broadcast: 'Diffusion',
    startBroadcast: 'Démarrer la diffusion',
    listeners: 'auditeurs',
    activeTranslations: 'Traductions actives',
    noActiveTranslations: 'Aucune pour l’instant— les auditeurs peuvent en demander',
    broadcastEditorOnly: 'La diffusion est disponible en mode éditeur (#editor).',
    listenOriginal: 'Original',
    favorites: 'Favoris',
    allLanguages: 'Toutes les langues',
    micLevel: 'Niveau du micro',
    noSlides: 'Aucune diapositive disponible',
    waitingForProclaim: 'En attente des donn\u00e9es Proclaim\u2026',
    isProclaimRunning: 'Le service Proclaim est-il actif\u00a0?',
    previous: 'Pr\u00e9c\u00e9dent',
    next: 'Suivant',
    untitledPresentation: 'Pr\u00e9sentation sans titre',
    goHome: 'Accueil',
    editorAccessDenied: "Cet appareil n'est pas autorisé à modifier. Session affichée en lecture seule.",
    dismiss: 'Fermer',
    enterWriteKey:
      "Cet appareil a besoin d'une clé d'écriture pour modifier. Collez-la ici, ou annulez pour rester en lecture seule.",
    statusWriteKeyTitle: "Clé d'écriture de cet appareil",
    statusWriteKeyDescription:
      "Autorise la modification, le microphone et la traduction depuis cet appareil. Une clé par appareil, pas par personne.",
    statusWriteKeyInstalled: 'Clé installée',
    statusWriteKeyMissing: 'Aucune clé sur cet appareil',
    statusWriteKeyPlaceholder: "Collez une clé d'écriture",
    statusWriteKeySave: 'Enregistrer',
    statusWriteKeyClear: 'Effacer',
    downloadSession: 'Télécharger la session',
    sessionResolving: 'Recherche de la session en cours…',
    sessionUnreachableTitle: 'Serveur injoignable',
    sessionUnreachableBody:
      'C’est le serveur qui décide quelle session est en direct : rien ne peut s’afficher tant qu’il n’a pas répondu. Vérifiez la connexion et réessayez, ou ajoutez ?doc=doc-AAAA-MM-JJ à l’adresse pour choisir vous-même une session.',
    statusSessionTitle: 'Session en cours',
    statusSessionDescription:
      'Tous les écrans et tous les services lisent cette valeur. Épinglez un document pour remplacer le choix du serveur ; l’épingle expire d’elle-même le lendemain matin.',
    statusSessionSourcePin: 'Épinglée',
    statusSessionSourceProposal: 'Proposée par le service de présentation',
    statusSessionSourceDate: 'Date du jour',
    statusSessionSetBy: 'définie par',
    statusSessionLapses: 'expire',
    statusSessionPin: 'Épingler',
    statusSessionClearPin: 'Retirer l’épingle',
    statusSessionPlaceholder: 'doc-AAAA-MM-JJ',
    statusSessionFailed: 'Impossible de modifier l’épingle',
    statusWritersTitle: 'Qui écrit où',
    statusWritersEmpty: 'Aucune demande d’écriture depuis 15 minutes.',
    statusWritersElsewhere: 'écrit dans une autre session',
    statusTitle: 'État de la session',
    statusHealthTitle: 'État des composants',
    statusHealthPlaceholder: 'L’état en direct des composants apparaîtra ici.',
    statusNotReporting: 'Pas encore de données',
    statusCanaryTitle: 'Vérification préalable',
    statusCanaryPlaceholder: 'Un contrôle de bout en bout avant le service s’exécutera ici.',
    statusExportTitle: 'Exporter la session',
    statusExportDescription:
      'Téléchargez les notes, les traductions de diapositives et les transcriptions en direct de cette session dans un seul fichier HTML lisible.',
    statusTranscriptsTitle: 'Transcriptions en direct',
    statusTranscriptsEmpty: 'Aucune transcription en direct dans cette session pour l’instant.',
    statusTranscriptSource: 'source',
    statusTranscriptNoUpdates: 'Aucune mise à jour depuis le chargement de la page',
    statusUpdatePending: 'Mise à jour en attente — redémarrez le service',
    slideReviewTitle: 'Révision des traductions de diapositives',
    loadOnAirItem: 'Charger l’élément à l’antenne',
    reTranslate: 'Retraduire',
    reTranslating: 'Retraduction…',
    notTranslatedYet: 'Pas encore traduit — utilisez Retraduire pour en faire un brouillon.',
    referenceCheckHeader: 'Vérification de la référence',
    referenceCheckLegend:
      'En rouge barré, le texte publié que la traduction a omis ou modifié ; en vert, les mots propres à la traduction.',
    referenceCheckCanonical: 'Texte de référence publié',
    referenceCheckAgent: 'Formulation de la traduction',
    referenceCheckSimilarityTitle: 'Part du texte publié conservée par la traduction',
    save: 'Enregistrer',
    saveAll: 'Tout enregistrer',
    saving: 'Enregistrement…',
    statusReviewed: 'Révisé',
    statusUnsaved: 'Non enregistré',
    reviewSourceHeader: 'Source',
    noSlidesToReview: 'Choisissez un élément du service, ou chargez l’élément à l’antenne, pour réviser ses diapositives.',
    editorOnlyReview: 'Ouvrez cette page avec #editor pour modifier et enregistrer les traductions.',
    reviewSlidesLink: 'Réviser les traductions de diapositives',
    unreviewedBadge: 'non révisé',
    conversationHeader: 'Conversation avec l’agent',
    noConversation: 'Aucune conversation pour l’instant — cliquez sur Retraduire pour en démarrer une.',
    followUpPlaceholder: 'Posez une question ou donnez un retour…',
    sendMessage: 'Envoyer',
    selectItemLabel: 'Élément du service',
    sourceChangedWarning: 'Les diapositives source ont changé depuis cette traduction.',
    agentThinking: 'L’agent travaille…',
    landingTagline: 'Traduction en direct du culte d\'aujourd\'hui. Choisissez votre langue.',
    landingCardSource: 'Lire, ou écouter',
    landingCardSlidesAndAudio: 'Diapositives et audio en direct',
    landingCardSlidesStandInAudio: 'Diapositives, audio en {lang}',
    landingCardSlidesOnly: 'Diapositives seulement',
    landingCardAudioOnly: 'Audio en direct et transcription',
    landingAnotherLanguage: 'Une autre langue',
    landingBack: 'Retour',
    landingSearch: 'Rechercher',
    landingAudioOnlyFootnote: 'Audio et transcription seulement — les diapositives sont traduites en {langs}.',
    landingHeadphones: 'L\'audio est facultatif : la transcription s\'affiche seule. Pour écouter, utilisez des écouteurs.',
    landingNotesTitle: 'Notes du sermon',
    landingTeam: 'Équipe',
  },
  es: {
    connecting: 'Conectando\u2026',
    disconnected: 'Desconectado',
    translation: 'Traducci\u00f3n',
    bilingual: 'Biling\u00fce',
    layoutEverything: 'Todo',
    decreaseFontSize: 'Disminuir tama\u00f1o de fuente',
    increaseFontSize: 'Aumentar tama\u00f1o de fuente',
    autoSpeak: '\u23f8\ufe0f Habla autom\u00e1tica',
    tapToSpeak: '\u25b6\ufe0f Toca para hablar',
    disableAutoTTS: 'Desactivar texto a voz autom\u00e1tico',
    enableAutoTTS: 'Activar texto a voz autom\u00e1tico',
    ttsError: 'Error: ',
    noContent: 'Sin contenido a\u00fan',
    notTranslated: '(no traducido)',
    jumpToLatest: '\u2193 Nuevo',
    transcriptPause: 'Pausa',
    listenLive: 'Escuchar en vivo',
    stopAudio: 'Detener audio',
    sourceTranscript: 'Transcripción de origen',
    spokenLanguage: 'Idioma hablado',
    liveListening: 'Escuchando en vivo',
    waitingForSpeaker: 'Esperando al orador…',
    restartingTranslation: 'Reiniciando la traducción…',
    waitingForTranscript: 'Esperando la transcripción…',
    waitingForSpeech: 'Esperando la traducción hablada…',
    liveAudioError: 'Audio en vivo no disponible',
    retry: 'Reintentar',
    broadcast: 'Transmisión',
    startBroadcast: 'Iniciar transmisión',
    listeners: 'oyentes',
    activeTranslations: 'Traducciones activas',
    noActiveTranslations: 'Ninguna aún— los oyentes pueden solicitarlas',
    broadcastEditorOnly: 'La transmisión está disponible en modo editor (#editor).',
    listenOriginal: 'Original',
    favorites: 'Favoritos',
    allLanguages: 'Todos los idiomas',
    micLevel: 'Nivel del micrófono',
    noSlides: 'No hay diapositivas disponibles',
    waitingForProclaim: 'Esperando datos de Proclaim\u2026',
    isProclaimRunning: '\u00bfEst\u00e1 ejecut\u00e1ndose el servicio Proclaim?',
    previous: 'Anterior',
    next: 'Siguiente',
    untitledPresentation: 'Presentaci\u00f3n sin t\u00edtulo',
    goHome: 'Ir al inicio',
    editorAccessDenied: 'Este dispositivo no está autorizado para editar. Sesión en solo lectura.',
    dismiss: 'Cerrar',
    enterWriteKey:
      'Este dispositivo necesita una clave de escritura para editar. Péguela aquí o cancele para continuar en solo lectura.',
    statusWriteKeyTitle: 'Clave de escritura de este dispositivo',
    statusWriteKeyDescription:
      'Autoriza la edición, el micrófono y la traducción desde este dispositivo. Una clave por dispositivo, no por persona.',
    statusWriteKeyInstalled: 'Clave instalada',
    statusWriteKeyMissing: 'Sin clave en este dispositivo',
    statusWriteKeyPlaceholder: 'Pegue una clave de escritura',
    statusWriteKeySave: 'Guardar',
    statusWriteKeyClear: 'Borrar',
    downloadSession: 'Descargar sesión',
    sessionResolving: 'Buscando la sesión actual…',
    sessionUnreachableTitle: 'No se puede conectar con el servidor',
    sessionUnreachableBody:
      'El servidor decide qué sesión está en directo, así que no hay nada que mostrar hasta que responda. Revise la conexión y vuelva a intentarlo, o añada ?doc=doc-AAAA-MM-DD a la dirección para elegir una sesión usted mismo.',
    statusSessionTitle: 'Sesión actual',
    statusSessionDescription:
      'Todas las pantallas y todos los servicios leen esto. Fije un documento para anular lo que elegiría el servidor; la fijación caduca sola a la mañana siguiente.',
    statusSessionSourcePin: 'Fijada',
    statusSessionSourceProposal: 'Propuesta por el servicio de presentación',
    statusSessionSourceDate: 'Fecha de hoy',
    statusSessionSetBy: 'fijada por',
    statusSessionLapses: 'caduca',
    statusSessionPin: 'Fijar',
    statusSessionClearPin: 'Quitar la fijación',
    statusSessionPlaceholder: 'doc-AAAA-MM-DD',
    statusSessionFailed: 'No se pudo cambiar la fijación',
    statusWritersTitle: 'Quién escribe dónde',
    statusWritersEmpty: 'Nada ha pedido escribir en los últimos 15 minutos.',
    statusWritersElsewhere: 'escribiendo en otra sesión',
    statusTitle: 'Estado de la sesión',
    statusHealthTitle: 'Estado de los componentes',
    statusHealthPlaceholder: 'El estado en vivo de los componentes aparecerá aquí.',
    statusNotReporting: 'Sin datos todavía',
    statusCanaryTitle: 'Verificación previa',
    statusCanaryPlaceholder: 'Aquí se ejecutará una comprobación de extremo a extremo antes del servicio.',
    statusExportTitle: 'Exportar sesión',
    statusExportDescription:
      'Descargue las notas, las traducciones de diapositivas y las transcripciones en vivo de esta sesión en un solo archivo HTML legible.',
    statusTranscriptsTitle: 'Transcripciones en vivo',
    statusTranscriptsEmpty: 'Aún no hay transcripciones en vivo en esta sesión.',
    statusTranscriptSource: 'fuente',
    statusTranscriptNoUpdates: 'Sin actualizaciones desde que se cargó la página',
    statusUpdatePending: 'Actualización pendiente — reinicie el servicio',
    slideReviewTitle: 'Revisi\u00f3n de traducciones de diapositivas',
    loadOnAirItem: 'Cargar elemento al aire',
    reTranslate: 'Retraducir',
    reTranslating: 'Retraduciendo\u2026',
    notTranslatedYet: 'A\u00fan sin traducir: use Retraducir para generar un borrador.',
    referenceCheckHeader: 'Verificaci\u00f3n de la referencia',
    referenceCheckLegend:
      'En rojo tachado, el texto publicado que la traducci\u00f3n omiti\u00f3 o cambi\u00f3; en verde, las palabras propias de la traducci\u00f3n.',
    referenceCheckCanonical: 'Texto de referencia publicado',
    referenceCheckAgent: 'Redacci\u00f3n de la traducci\u00f3n',
    referenceCheckSimilarityTitle: 'Cu\u00e1nto del texto publicado conserv\u00f3 la traducci\u00f3n',
    save: 'Guardar',
    saveAll: 'Guardar todo',
    saving: 'Guardando\u2026',
    statusReviewed: 'Revisado',
    statusUnsaved: 'Sin guardar',
    reviewSourceHeader: 'Fuente',
    noSlidesToReview: 'Seleccione un elemento del servicio, o cargue el elemento al aire, para revisar sus diapositivas.',
    editorOnlyReview: 'Abra esta p\u00e1gina con #editor para editar y guardar traducciones.',
    reviewSlidesLink: 'Revisar traducciones de diapositivas',
    unreviewedBadge: 'sin revisar',
    conversationHeader: 'Conversación con el agente',
    noConversation: 'Aún no hay conversación — pulse Retraducir para iniciar una.',
    followUpPlaceholder: 'Haga una pregunta o dé su opinión…',
    sendMessage: 'Enviar',
    selectItemLabel: 'Elemento del servicio',
    sourceChangedWarning: 'Las diapositivas de origen cambiaron desde esta traducción.',
    agentThinking: 'El agente está trabajando…',
    landingTagline: 'Traducción en vivo del culto de hoy. Elija su idioma.',
    landingCardSource: 'Leer, o escuchar',
    landingCardSlidesAndAudio: 'Diapositivas y audio en vivo',
    landingCardSlidesStandInAudio: 'Diapositivas, audio en {lang}',
    landingCardSlidesOnly: 'Solo diapositivas',
    landingCardAudioOnly: 'Audio en vivo y transcripción',
    landingAnotherLanguage: 'Otro idioma',
    landingBack: 'Volver',
    landingSearch: 'Buscar',
    landingAudioOnlyFootnote: 'Solo audio y transcripción — las diapositivas se traducen a: {langs}.',
    landingHeadphones: 'El audio es opcional: la transcripción aparece sola. Para escuchar, use audífonos.',
    landingNotesTitle: 'Notas del sermón',
    landingTeam: 'Equipo',
  },
  ht: {
    connecting: 'Koneksyon\u2026',
    disconnected: 'Dekonekte',
    translation: 'Tradiksyon',
    bilingual: 'Bileng',
    layoutEverything: 'Tout bagay',
    decreaseFontSize: 'Diminye gw\u00f2s\u00e8 l\u00e8t',
    increaseFontSize: 'Ogmante gw\u00f2s\u00e8 l\u00e8t',
    autoSpeak: '\u23f8\ufe0f Pale otomatik',
    tapToSpeak: '\u25b6\ufe0f Peze pou pale',
    disableAutoTTS: 'Dezaktive t\u00e8ks-an-vwa otomatik',
    enableAutoTTS: 'Aktive t\u00e8ks-an-vwa otomatik',
    ttsError: 'Er\u00e8\u00a0: ',
    noContent: 'Pa gen kontni pou kounye a',
    notTranslated: '(pa tradui)',
    jumpToLatest: '↓ Nouvo',
    transcriptPause: 'Poz',
    listenLive: 'Koute an dirèk',
    stopAudio: 'Sispann odyo',
    sourceTranscript: 'Transkripsyon sous',
    spokenLanguage: 'Lang y ap pale a',
    liveListening: 'Ap koute an dirèk',
    waitingForSpeaker: 'N ap tann moun k ap pale a…',
    restartingTranslation: 'N ap redemare tradiksyon an…',
    waitingForTranscript: 'N ap tann transkripsyon an…',
    waitingForSpeech: 'N ap tann tradiksyon vokal la…',
    liveAudioError: 'Odyo an dirèk pa disponib',
    retry: 'Reeseye',
    broadcast: 'Difizyon',
    startBroadcast: 'Kòmanse difizyon',
    listeners: 'moun k ap koute',
    activeTranslations: 'Tradiksyon aktif',
    noActiveTranslations: 'Pa gen okenn pou kounye a— moun k ap koute ka mande yo',
    broadcastEditorOnly: 'Difizyon disponib nan mòd editè (#editor).',
    listenOriginal: 'Orijinal',
    favorites: 'Favori',
    allLanguages: 'Tout lang yo',
    micLevel: 'Nivo mikwo',
    noSlides: 'Pa gen diapozitiv disponib',
    waitingForProclaim: 'Ap tann done Proclaim\u2026',
    isProclaimRunning: '\u00c8ske s\u00e8vis Proclaim la ap kouri?',
    previous: 'Anvan',
    next: 'Apr\u00e8',
    untitledPresentation: 'Prezantasyon San Tit',
    goHome: 'Retounen lakay',
    editorAccessDenied: 'Aparèy sa a pa otorize pou modifye. N ap montre sesyon an an lekti sèlman.',
    dismiss: 'Fèmen',
    enterWriteKey:
      'Aparèy sa a bezwen yon kle ekriti pou l ka modifye. Kole l isit la, oswa anile pou w rete an lekti sèlman.',
    statusWriteKeyTitle: 'Kle ekriti aparèy sa a',
    statusWriteKeyDescription:
      'Li otorize modifikasyon, mikwofòn nan, ak tradiksyon depi aparèy sa a. Yon kle pou chak aparèy, pa pou chak moun.',
    statusWriteKeyInstalled: 'Kle enstale',
    statusWriteKeyMissing: 'Pa gen kle sou aparèy sa a',
    statusWriteKeyPlaceholder: 'Kole yon kle ekriti',
    statusWriteKeySave: 'Anrejistre',
    statusWriteKeyClear: 'Efase',
    downloadSession: 'Telechaje sesyon an',
    sessionResolving: 'N ap chèche sesyon an k ap dewoule kounye a…',
    sessionUnreachableTitle: 'Nou pa ka jwenn sèvè a',
    sessionUnreachableBody:
      'Se sèvè a ki deside ki sesyon k ap dewoule, kidonk nou pa ka montre anyen toutotan li poko reponn. Tcheke koneksyon an epi eseye ankò, oswa mete ?doc=doc-AAAA-MM-JJ nan adrès la pou w chwazi yon sesyon ou menm.',
    statusSessionTitle: 'Sesyon kounye a',
    statusSessionDescription:
      'Tout ekran ak tout sèvis li sa a. Tache yon dokiman pou ranplase sa sèvè a ta chwazi; tach la ap tonbe pou kont li nan denmen maten.',
    statusSessionSourcePin: 'Tache',
    statusSessionSourceProposal: 'Sèvis prezantasyon an pwopoze l',
    statusSessionSourceDate: 'Dat jodi a',
    statusSessionSetBy: 'mete pa',
    statusSessionLapses: 'ap tonbe',
    statusSessionPin: 'Tache',
    statusSessionClearPin: 'Retire tach la',
    statusSessionPlaceholder: 'doc-AAAA-MM-JJ',
    statusSessionFailed: 'Nou pa t ka chanje tach la',
    statusWritersTitle: 'Kiyès k ap ekri ki kote',
    statusWritersEmpty: 'Anyen pa mande pou ekri nan 15 dènye minit yo.',
    statusWritersElsewhere: 'l ap ekri nan yon lòt sesyon',
    statusTitle: 'Estati sesyon an',
    statusHealthTitle: 'Estati konpozan yo',
    statusHealthPlaceholder: 'Estati konpozan yo an dirèk ap parèt isit la.',
    statusNotReporting: 'Poko gen done',
    statusCanaryTitle: 'Tchèk anvan sèvis la',
    statusCanaryPlaceholder: 'Yon tchèk konplè anvan sèvis la ap fèt isit la.',
    statusExportTitle: 'Ekspòte sesyon an',
    statusExportDescription:
      'Telechaje nòt yo, tradiksyon dyapozitiv yo, ak transkripsyon an dirèk sesyon sa a nan yon sèl fichye HTML ki fasil pou li.',
    statusTranscriptsTitle: 'Transkripsyon an dirèk',
    statusTranscriptsEmpty: 'Poko gen transkripsyon an dirèk nan sesyon sa a.',
    statusTranscriptSource: 'sous',
    statusTranscriptNoUpdates: 'Pa gen mizajou depi paj la chaje',
    statusUpdatePending: 'Gen yon mizajou k ap tann — rekòmanse sèvis la',
    slideReviewTitle: 'Revizyon Tradiksyon Diapozitiv',
    loadOnAirItem: 'Chaje eleman k ap pase a',
    reTranslate: 'Retradui',
    reTranslating: 'Ap retradui…',
    notTranslatedYet: 'Poko tradui — sèvi ak Retradui pou fè yon bouyon.',
    referenceCheckHeader: 'Verifikasyon referans',
    referenceCheckLegend:
      'Wouj ak liy ladan se tèks pibliye tradiksyon an kite oswa chanje; vèt se pwòp mo tradiksyon an.',
    referenceCheckCanonical: 'Tèks referans pibliye',
    referenceCheckAgent: 'Fason tradiksyon an di li',
    referenceCheckSimilarityTitle: 'Konbyen nan tèks pibliye a tradiksyon an kenbe',
    save: 'Anrejistre',
    saveAll: 'Anrejistre tout',
    saving: 'Ap anrejistre…',
    statusReviewed: 'Revize',
    statusUnsaved: 'Pa anrejistre',
    reviewSourceHeader: 'Sous',
    noSlidesToReview: 'Chwazi yon eleman nan sèvis la, oswa chaje eleman k ap pase a, pou revize diapozitiv li yo.',
    editorOnlyReview: 'Ouvri paj sa a ak #editor pou modifye ak anrejistre tradiksyon.',
    reviewSlidesLink: 'Revize Tradiksyon Diapozitiv',
    unreviewedBadge: 'pa revize',
    conversationHeader: 'Konvèsasyon ak ajan an',
    noConversation: 'Poko gen konvèsasyon — klike Retradui pou kòmanse youn.',
    followUpPlaceholder: 'Poze yon kesyon oswa bay yon kòmantè…',
    sendMessage: 'Voye',
    selectItemLabel: 'Eleman sèvis la',
    sourceChangedWarning: 'Diapozitiv sous yo chanje depi tradiksyon sa a.',
    agentThinking: 'Ajan an ap travay…',
    landingTagline: 'Tradiksyon an dirèk pou sèvis jodi a. Chwazi lang ou.',
    landingCardSource: 'Li, oswa koute',
    landingCardSlidesAndAudio: 'Dyapozitiv ak odyo an dirèk',
    landingCardSlidesStandInAudio: 'Dyapozitiv, odyo an {lang}',
    landingCardSlidesOnly: 'Dyapozitiv sèlman',
    landingCardAudioOnly: 'Odyo an dirèk ak transkripsyon',
    landingAnotherLanguage: 'Yon lòt lang',
    landingBack: 'Retounen',
    landingSearch: 'Chèche',
    landingAudioOnlyFootnote: 'Odyo ak transkripsyon sèlman — dyapozitiv yo tradui an {langs}.',
    landingHeadphones: 'Odyo a pa obligatwa: transkripsyon an parèt pou kont li. Pou koute, sèvi ak ekoutè.',
    landingNotesTitle: 'Nòt prèch la',
    landingTeam: 'Ekip',
  },
};
