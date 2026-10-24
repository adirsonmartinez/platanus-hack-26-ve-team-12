// Every icon the app uses: our name -> Hugeicons (free, stroke rounded) export name.
// After changing this list run `npm run icons` to regenerate hugeicons.js.
// Browse the set at https://hugeicons.com/icons (free style only).
export const ICON_NAMES = {
  search: 'Search01Icon',
  folder: 'Folder01Icon',
  alert: 'Alert02Icon',
  wrench: 'Wrench01Icon',
  server: 'ServerStack01Icon',
  plug: 'Plug01Icon',
  home: 'Home03Icon',
  gitBranch: 'GitBranchIcon',
  sidebar: 'SidebarLeftIcon',
  plus: 'PlusSignIcon',
  minus: 'MinusSignIcon',
  rotateLeft: 'UndoIcon',
  rotateRight: 'RedoIcon',
  center: 'Gps01Icon',
  hand: 'HandGrabIcon', // move the map with a hand in front of the camera
  bot: 'BotIcon',
  pin: 'PinIcon',
  arrowUp: 'ArrowUp02Icon',
  grip: 'DragDropVerticalIcon',
  eye: 'ViewIcon',
  // Servers panel and its ⋯ menu
  openExternal: 'LinkSquare02Icon',
  globe: 'Globe02Icon',
  appWindow: 'AppWindowIcon',
  pause: 'PauseIcon',
  play: 'PlayIcon',
  stop: 'StopIcon',
  terminal: 'ComputerTerminal01Icon',
  close: 'Cancel01Icon',
  output: 'TextAlignLeftIcon',
  more: 'MoreHorizontalIcon',
  // chat: answer cards, map cards, chips, run steps, Vibe / Dev
  sparkles: 'SparklesIcon',
  vibe: 'BubbleChatIcon', // "te hablo simple" (a wand looked like an editing tool)
  improve: 'AiEditingIcon', // "Mejorar mi mensaje"
  openExternal: 'SquareArrowUpRightIcon', // "Abrir en el navegador"
  folderOpen: 'FolderOpenIcon', // "Mostrar en la carpeta"
  unfoldMore: 'UnfoldMoreIcon', // explorer: expand every folder
  unfoldLess: 'UnfoldLessIcon', // explorer: collapse every folder
  // The connected agent's mark in the chat header
  route: 'Route01Icon',
  cursor: 'Cursor02Icon',
  dev: 'SourceCodeIcon',
  arrowRight: 'ArrowRight01Icon',
  arrowLeft: 'ArrowLeft01Icon',
  ask: 'MessageQuestionIcon',
  danger: 'AlertDiamondIcon',
  ok: 'CheckmarkCircle02Icon',
  idea: 'Idea01Icon',
  step: 'Task01Icon',
  info: 'InformationCircleIcon',
  file: 'File01Icon',
  locate: 'MapsLocation01Icon',
  audit: 'FileSearchIcon',
  shieldOk: 'SecurityCheckIcon',
  shieldWarn: 'SecurityWarningIcon',
  layers: 'Layers01Icon',
  subagent: 'UserGroupIcon',
};

// The agents' own logos (not Hugeicons): our name -> file in @lobehub/icons-static-svg (MIT). The color
// versions keep their brand colors; the others take the text color. `npm run icons` copies them too.
export const BRAND_NAMES = {
  claude: 'claude-color',
  codex: 'codex-color',
  grok: 'grok',
  opencode: 'opencode',
  cursorApp: 'cursor',
  kimi: 'kimi-color',
  gemini: 'gemini-color',
  qwen: 'qwen-color',
};
