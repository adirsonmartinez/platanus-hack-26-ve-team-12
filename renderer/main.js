// Composition root: creates Models -> ViewModels -> Views and wires them together.
// Models know nothing about the screen; ViewModels hold screen state and actions (no DOM, no three.js);
// Views only draw and forward user input to ViewModels.
import { findNode } from './models/fileTree.js';
import { createEventBus, EVENTS } from './core/eventBus.js';
import { strings } from './i18n/es.js';
import { createWorkspaceService } from './services/workspaceService.js';
import { createAgentService } from './services/agentService.js';
import { connectMcpBridge } from './services/mcpBridge.js';
import { createServerService } from './services/serverService.js';
import { ServersModel } from './models/serversModel.js';
import { ServersViewModel } from './viewmodels/serversViewModel.js';
import { createGitService } from './services/gitService.js';
import { createHandTrackingService } from './services/handTrackingService.js';

import { ProjectModel } from './models/projectModel.js';
import { SecurityModel } from './models/securityModel.js';
import { SupabaseModel } from './models/supabaseModel.js';
import { AgentModel } from './models/agentModel.js';
import { GitModel } from './models/gitModel.js';
import { AgentConnectionModel } from './models/agentConnectionModel.js';
import { ModeModel } from './models/modeModel.js';
import { UserLevelModel } from './models/userLevelModel.js';
import { RepairHistoryModel } from './models/repairHistoryModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ApprovalModel } from './models/approvalModel.js';
import { ComposerViewModel } from './viewmodels/composerViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { GitViewModel } from './viewmodels/gitViewModel.js';
import { AppViewModel } from './viewmodels/appViewModel.js';
import { ShellViewModel } from './viewmodels/shellViewModel.js';
import { RepairViewModel } from './viewmodels/repairViewModel.js';
import { HandControlViewModel } from './viewmodels/handControlViewModel.js';
import { EditorViewModel } from './viewmodels/editorViewModel.js';

import { createSceneView } from './views/scene/sceneView.js';
import { createMapView } from './views/scene/mapView.js';
import { createSupabaseView } from './views/scene/supabaseView.js';
import { createInputController } from './views/scene/inputController.js';
import { createGitView } from './views/scene/gitView.js';
import { createRemiView } from './views/scene/remiView.js';
import { createRobotView } from './views/scene/robotView.js';
import { RobotDialogViewModel } from './viewmodels/robotDialogViewModel.js';
import { createHudView } from './views/ui/hudView.js';
import { createLabelLayer } from './views/ui/labelLayer.js';
import { createControlsView } from './views/ui/controlsView.js';
import { createHandControlView } from './views/ui/handControlView.js';
import { createPanelsView } from './views/ui/panelsView.js';
import { createChatView } from './views/ui/chatView.js';
import { createShellView } from './views/ui/shellView.js';
import { createAgentConnectView } from './views/ui/agentConnectView.js';
import { createAgentPickerView } from './views/ui/agentPickerView.js';
import { attachMenu } from './views/ui/chatMenuView.js';
import { chatMenuItems } from './viewmodels/chatMenu.js';
import { createIconBarView } from './views/ui/iconBarView.js';
import { createChatDockView } from './views/ui/chatDockView.js';
import { createRepairPanelView } from './views/ui/repairPanelView.js';
import { createHoverCardView } from './views/ui/hoverCardView.js';
import { createEditorView } from './views/ui/editorView.js';
import { remiJump } from './views/ui/remiJump.js';
import { applyStrings } from './views/ui/domStrings.js';
import { applyIcons } from './views/icons.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
const projectModel = new ProjectModel(workspace);
const securityModel = new SecurityModel();
const supabaseModel = new SupabaseModel();
const gitModel = new GitModel(workspace);
const agentService = createAgentService();
const connection = new AgentConnectionModel(agentService);
const modeModel = new ModeModel();
const repairHistory = new RepairHistoryModel();
const serversModel = new ServersModel(createServerService());
const gitService = createGitService();
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel, connection, modeModel, gitService });

// Reload git history automatically after every write operation (commit, revert, reset, checkout...)
if (gitService.onChanged) {
  gitService.onChanged(() => gitModel.scheduleReload());
}

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, supabaseViewModel, bus });
const gitViewModel = new GitViewModel({ gitModel, camera: cameraViewModel, bus });
const appViewModel = new AppViewModel({ camera: cameraViewModel, gitModel, gitViewModel });
const shellViewModel = new ShellViewModel({ projectModel, securityModel, mapViewModel, compact: window.matchMedia('(max-width: 820px)').matches });
const repairViewModel = new RepairViewModel({ securityModel, mapViewModel, cameraViewModel, connection, history: repairHistory, agentService, bus, voiceMode: () => (modeModel.tech ? 'dev' : 'vibe') });
const serversViewModel = new ServersViewModel({ serversModel });
const editorViewModel = new EditorViewModel({ workspace, bus }); // files clicked on the map open as tabs
const handTracking = createHandTrackingService();
const handControlViewModel = new HandControlViewModel({ tracking: handTracking, camera: cameraViewModel });
// The server list only refreshes while its side view is on screen
shellViewModel.store.subscribe(({ side, sidebarOpen }) => serversViewModel.setVisible(sidebarOpen && side === 'servers'), { immediate: true });

// App actions shared by the chat, the menus and the sidebar
const stage = document.getElementById('stage');
const actions = {
  // Remi hops from the button to the map, then walks to the file's folder
  repair(path, from = null) {
    shellViewModel.setStage('map');
    if (repairViewModel.busy || !from) return repairViewModel.start(path);
    remiJump(from, stage).then(() => repairViewModel.start(path));
  },
  repairWorst(from = null) {
    const worst = shellViewModel.store.state.risks.find((f) => f.level === 'red' || f.by !== 'remi');
    if (!worst) return chatViewModel.sayFromMap({ text: strings.repair.nothing });
    actions.repair(worst.path, from);
  },
  showRisks: () => shellViewModel.store.state.side === 'risks' && shellViewModel.store.state.sidebarOpen || shellViewModel.setSide('risks'),
  // Send a file to the chat so the agent checks whether its risk is real
  audit(path, reason) {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
    chatViewModel.send(strings.chat.auditPrompt(path, reason));
  },
  // A file or folder named by the agent (links and "Ver … en el mapa" chips)
  // Opening files from the chat (chatViewModel.openFile)
  // The tree is loaded level by level: what it does not hold yet is asked to the disk
  entryOf: async (path) => (path ? findNode(projectModel.store.state.tree, path) : null)
    ?? (await workspace.kind(path).then((r) => (r.ok && r.data ? { path, type: r.data } : null))),
  fileInfo: (path) => securityModel.scoreOf(path),
  readFile: (path) => workspace.read(path),
  openFile: (path, how) => workspace.open(path, how),
  locate(path) {
    shellViewModel.setStage('map');
    if (!mapViewModel.show(path)) chatViewModel.sayFromMap({ text: strings.chat.notInProject(path) });
  },
  showConnect: () => (shellViewModel.store.state.side === 'agent' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('agent'),
  showRepairs: () => (shellViewModel.store.state.side === 'repairs' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('repairs'),
  openChat() {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
  },
  // The welcome robot hands a ready-made request to the agent (scaffold, .gitignore, README). With no agent
  // connected (none logged in, so none picked automatically) the scripted demo would answer, so the request
  // waits until the person picks one
  askAgent(prompt) {
    actions.openChat();
    robotTexts.add(prompt);
    if (connection.live) return chatViewModel.send(prompt);
    pendingAgentPrompt = prompt;
    actions.showConnect();
    chatViewModel.sayFromMap({ text: strings.map.welcome.pickAgent });
  },
  // The robot's "save my progress": a commit understood by the chat itself (git asks before writing)
  saveProgress() {
    actions.openChat();
    robotTexts.add(strings.map.welcome.saveProgressPhrase);
    chatViewModel.send(strings.map.welcome.saveProgressPhrase);
  },
};
let pendingAgentPrompt = null;
const robotTexts = new Set(); // messages the robot sent for the person: not something to learn from
connection.store.subscribe(() => {
  if (!connection.live || !pendingAgentPrompt) return;
  const prompt = pendingAgentPrompt;
  pendingAgentPrompt = null;
  chatViewModel.send(prompt);
});
const chatViewModel = new ChatViewModel({ agentModel, bus, actions, connection });

// The person's level (the welcome robot adapts to it) and the app's Vibe / Dev mode move together:
// a programmer gets Dev; switching by hand moves the level. Someone already on Dev counts as a programmer.
const userLevel = new UserLevelModel();
if (modeModel.tech && !userLevel.store.state.confirmed) userLevel.followMode('tech');
userLevel.store.subscribe(({ level }, previous) => { if (previous && level !== previous.level) modeModel.set(level === 'pro' ? 'tech' : 'vibe'); });
modeModel.store.subscribe(({ mode }, previous) => { if (previous && mode !== previous.mode) userLevel.followMode(mode); });
// It also learns from what the person writes in the chat (technical words, or "no entiendo")
chatViewModel.store.subscribe(({ messages }, previous) => {
  if (!previous || messages.length <= previous.messages.length) return;
  messages.slice(previous.messages.length)
    .filter((m) => m.role === 'user' && !robotTexts.has(m.text))
    .forEach((m) => userLevel.learnFromText(m.text));
});
const robotDialogViewModel = new RobotDialogViewModel({ mapViewModel, projectModel, securityModel, actions, userLevel });
// The agent waits for the person to approve a change (main process dialog): the chat says so
agentService.onAwaiting((detail) => bus.emit(EVENTS.agentAwaiting, detail));
agentService.onChanged((change) => bus.emit(EVENTS.agentChanged, change)); // its diff, live in the chat

// The stage tab drives which 3D view is on screen: the git tab shows the branches, the rest the map
shellViewModel.store.subscribe(({ stage: tab }) => appViewModel.setView(tab === 'git' ? 'git' : 'map'), { immediate: true });

// --- Views ---
applyStrings();
applyIcons(); // Hugeicons into the static <i data-icon> slots, before the views look for them
const sceneView = createSceneView(cameraViewModel, stage); // the map lives in the IDE stage
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
const mapView = createMapView({ sceneView, labels, mapViewModel });
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
const gitView = createGitView({ sceneView, labels, gitViewModel });
createRemiView({ sceneView, labels, repairViewModel });
createRobotView({ sceneView, labels, mapViewModel, robotDialogViewModel });
sceneView.onFrame(labels.update); // last: after every view moved its anchors
appViewModel.store.subscribe(({ view }) => {
  sceneView.setActiveLayer(view);
  labels.setActiveLayer(view);
}, { immediate: true });
createEditorView({ stage, editorViewModel });
const hoverCard = createHoverCardView({ card: document.getElementById('hover-card'), stage, mapViewModel, modeModel });

// Clicks, hover and Esc go to the view on screen
const projectOpen = () => mapViewModel.store.state.status === 'ready';
const pickers = {
  map: () => ({
    targets: [...supabaseView.pickTargets(), ...mapView.pickTargets()],
    handle: (pick) => mapViewModel.handlePick(pick),
  }),
  git: () => ({ targets: gitView.pickTargets(), handle: (pick) => gitViewModel.handlePick(pick) }),
};
createInputController({
  sceneView,
  cameraViewModel,
  picker: () => (projectOpen() ? pickers[appViewModel.view]() : null),
  onEscape: () => (appViewModel.view === 'git' ? gitViewModel.escape() : mapViewModel.escape()),
  onToggleView: () => shellViewModel.setStage(appViewModel.view === 'git' ? 'map' : 'git'),
  onHover: (pick, x, y) => hoverCard.show(appViewModel.view === 'map' ? pick : null, x, y),
});
createControlsView({ cameraViewModel, onReset: () => (appViewModel.view === 'map' ? mapViewModel.home() : cameraViewModel.reset()) });
createHandControlView({ handControlViewModel, video: handTracking.video });
createPanelsView({ appViewModel, mapViewModel, supabaseViewModel, gitViewModel });
// Which agent changes ask first (Manual / Auto / Sin preguntar)
const approvalModel = new ApprovalModel(agentService);
approvalModel.init();
const composerViewModel = new ComposerViewModel({ connection, projectModel, modeModel });
createChatView({ chatViewModel, composerViewModel, connection, modeModel });
createHudView({ appViewModel, mapViewModel, gitViewModel, onShowRisks: () => actions.showRisks() });
createShellView({ shellViewModel, modeModel, approval: approvalModel, repairViewModel, repairHistory, serversViewModel, actions });
createRepairPanelView({ container: document.getElementById('remi-layer'), repairViewModel, modeModel, actions });
createAgentPickerView({ container: document.getElementById('agent-picker'), connection, approval: approvalModel, onMore: actions.showConnect });
createIconBarView({ bar: document.getElementById('stage-tabs') });
createIconBarView({ bar: document.getElementById('side-dock'), vertical: true });
// The chat and the side panel stay in their place (bottom right, left edge); the chat can be pinned as a column
const workspaceEl = document.getElementById('workspace');
createChatDockView({ workspace: workspaceEl, chat: document.getElementById('chat'), pinButton: document.getElementById('chat-pin') });
// The security card stays fixed at the top right of the map (hud.css)

// Chat options: the "+" in the composer, and the floating button when the chat is minimized or closed
const $id = (id) => document.getElementById(id);
const openChat = () => {
  if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
  if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
};
// What the chat menus show, read when they open: who answers, whether it works, the worst risk, the counts
// and the repairs waiting to be checked
const menuInfo = () => {
  const c = connection.store.state;
  const agent = c.agents.find((a) => a.id === c.selected);
  const shell = shellViewModel.store.state;
  const worst = shell.risks.find((f) => f.level === 'red' || f.by !== 'remi') ?? null;
  const last = chatViewModel.store.state.messages.at(-1);
  return {
    agent: agent ? { id: agent.id, name: agent.label.split(' (')[0] } : null,
    working: Boolean(chatViewModel.store.state.typing || last?.run?.status === 'running'),
    worst: worst && { path: worst.path, level: worst.level },
    counts: shell.counts,
    pending: repairHistory.store.state.entries.filter((e) => e.status === 'fixed' || e.status === 'planned').length,
  };
};
attachMenu($id('chat-more'), $id('chat-more-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, info: menuInfo }));
attachMenu($id('chat-launcher-button'), $id('chat-launcher-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, openChat, info: menuInfo }));
createAgentConnectView({ container: document.getElementById('agent-connect'), connection, modeModel });
connectMcpBridge({ agentService, securityModel, shellViewModel });
connection.refresh();

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session === previous.session) return;
  repairViewModel.reset(); // nothing from the previous project keeps running
  if (!state.open) { // closed: back to the start screen
    handControlViewModel.stop(); // the camera goes off with the project
    gitModel.clear();
    bus.emit(EVENTS.projectClosed, { name: previous.name ?? strings.map.defaultProjectName });
    return;
  }
  repairHistory.load(state.name ?? strings.map.defaultProjectName); // each project keeps its own history
  bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
  // Fresh git history and cameras for the new project
  appViewModel.resetCameras();
  gitModel.clear();
  gitModel.load();
  if (appViewModel.view === 'git') gitViewModel.centerOnHead();
});

// macOS: the Project menu of the system menu bar runs the same actions as the in-app one
const MENU_ACTIONS = {
  newProject: () => shellViewModel.newProject(),
  openProject: () => shellViewModel.openProject(),
  openRecent: ({ root }) => shellViewModel.openRecent(root),
  closeProject: () => shellViewModel.closeProject(),
};
workspace.onMenuAction((payload) => MENU_ACTIONS[payload?.action]?.(payload));

workspace.onChanged((paths) => {
  bus.emit(EVENTS.diskChanged, { paths });
  projectModel.scheduleReload();
  gitModel.scheduleReload();
});

// .git is not watched (too noisy), so commits made in a terminal show up when the window regains focus
window.addEventListener('focus', () => { if (projectOpen()) gitModel.scheduleReload(); });

// Public hook for the AI agent: set the traffic light of a file.
//   window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level: 'red', reason } }))
window.addEventListener('file:score', (e) => {
  const { path, level, reason } = e.detail ?? {};
  securityModel.setScore(path, level, reason);
});

// If the app already had a folder open (e.g. after reloading the window), show it
projectModel.restore();
