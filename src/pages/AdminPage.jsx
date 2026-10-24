import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, Code2, Copy, Download, Eye,
  FileJson2, FlaskConical, ImagePlus, LogIn, LogOut, Plus, RotateCcw, Save, ShieldCheck, Sparkles,
  Trash2, TriangleAlert, Upload, X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getPublicConfig, saveConfig } from '../lib/catalog';
import seedConfig from '../data/seed.json';
import CardImage from '../components/CardImage';
import RunningStyleLogo from '../components/RunningStyleLogo';
import { findMatchingScenario, getScenarioRecommendations, makeEmptyConditions, makeEmptyRecommendations, RECOMMENDATION_CATEGORIES, RUNNING_STYLES, validateConfig } from '../lib/scenarioEngine';

const CORE_ORDER = ['kitasan-black', 'super-creek', 'fine-motion', 'agnes-tachyon', 'maruzensky', 'mr-cb'];
const CORE_LABELS = {
  'kitasan-black': 'Kitasan Black',
  'super-creek': 'Super Creek',
  'fine-motion': 'Fine Motion',
  'agnes-tachyon': 'Agnes Tachyon',
  maruzensky: 'Maruzensky',
  'mr-cb': 'Mr. C.B.',
};
const LB_CHOICES = [
  { value: 'any', label: 'Ignore / any level' },
  { value: '-1', label: 'Not owned' },
  { value: '0', label: 'LB0' },
  { value: '1', label: 'LB1' },
  { value: '2', label: 'LB2' },
  { value: '3', label: 'LB3' },
  { value: '4', label: 'LB4' },
];
function sortCoreCards(cards) {
  const rank = new Map(CORE_ORDER.map((id, index) => [id, index]));
  return [...cards].filter((card) => card.isCore).sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

function makeId(prefix = 'item') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureConfig(value) {
  const source = value && typeof value === 'object' ? value : seedConfig;
  const rawOldCards = Array.isArray(source.cards) ? source.cards : [];
  const oldCards = rawOldCards.map((card) => {
    if (!card || typeof card !== 'object') return card;
    const imageId = String(card.gameCardId || card.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || '');
    const sameGameCard = seedConfig.cards.find((defaultCard) => String(defaultCard.gameCardId || defaultCard.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || '') === imageId && imageId);
    if (!sameGameCard || String(card.id) === String(sameGameCard.id)) return card;
    return { ...sameGameCard, ...card, id: sameGameCard.id, gameCardId: imageId };
  }).filter(Boolean);
  const byId = new Map(oldCards.map((card) => [String(card.id), card]));
  const defaults = [
    ...seedConfig.cards.filter((card) => card.isCore).map((card) => ({ ...card, ...(byId.get(String(card.id)) || {}), isCore: true })),
    ...seedConfig.cards.filter((card) => !card.isCore).map((card) => ({ ...card, ...(byId.get(String(card.id)) || {}), isCore: false })),
  ];
  const cards = [...defaults];
  oldCards.forEach((card) => {
    if (!cards.some((existing) => String(existing.id) === String(card.id))) cards.push({ ...card, isCore: false });
  });
  return {
    ...seedConfig,
    ...source,
    cards,
    scenarios: Array.isArray(source.scenarios) ? source.scenarios.map((scenario) => ({
      ...scenario,
      conditions: scenario.conditions && typeof scenario.conditions === 'object' ? scenario.conditions : {},
      recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}) },
      enabled: scenario.enabled !== false,
      priority: Number(scenario.priority || 0),
    })) : [],
  };
}

function summarizeCondition(scenario, coreCards) {
  const parts = coreCards.flatMap((card) => {
    const raw = scenario.conditions?.[card.id];
    if (raw === undefined || raw === null || raw === 'any' || raw === '*' || raw === 'ignore') return [];
    const n = Number(raw);
    const value = n === -1 ? 'Not owned' : `LB${n}`;
    return [`${card.name || CORE_LABELS[card.id] || card.id}: ${value}`];
  });
  return parts.length ? parts.join(' · ') : 'All conditions ignored';
}

export default function AdminPage() {
  const localMode = !isSupabaseConfigured;
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [config, setConfig] = useState(ensureConfig(seedConfig));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [activeTab, setActiveTab] = useState('scenarios');
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('universal');
  const [json, setJson] = useState(JSON.stringify(ensureConfig(seedConfig), null, 2));
  const [newRecCardId, setNewRecCardId] = useState('');
  const [newRecSearch, setNewRecSearch] = useState('');
  const [testLevels, setTestLevels] = useState({});
  const [testStyles, setTestStyles] = useState([]);
  const [conflictDetected, setConflictDetected] = useState(false);
  const restoreInputRef = useRef(null);
  const savedConfigJsonRef = useRef(JSON.stringify(ensureConfig(seedConfig)));
  const savedRevisionRef = useRef(null);

  const coreCards = useMemo(() => sortCoreCards(config.cards || []), [config.cards]);
  const recommendationCards = useMemo(() => (config.cards || []), [config.cards]);
  const scenarios = Array.isArray(config.scenarios) ? config.scenarios : [];
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) || scenarios[0] || null;
  const activeRecommendations = selectedScenario?.recommendations?.[activeCategory] || [];
  const filteredRecommendationCards = useMemo(() => {
    const query = newRecSearch.trim().toLowerCase();
    if (!query) return [];
    return recommendationCards.filter((card) => `${card.name} ${card.type || ''} ${card.rarity || ''} ${card.gameCardId || ''}`.toLowerCase().includes(query));
  }, [recommendationCards, newRecSearch]);
  const selectedRecommendationCard = recommendationCards.find((card) => String(card.id) === String(newRecCardId)) || null;
  const hasUnsavedChanges = JSON.stringify(config) !== savedConfigJsonRef.current;
  const hasUnappliedJsonDraft = json !== JSON.stringify(config, null, 2);
  const hasUnsavedWork = hasUnsavedChanges || hasUnappliedJsonDraft;
  const testComplete = coreCards.length > 0 && coreCards.every((card) => testLevels[card.id] !== undefined && testLevels[card.id] !== null && testLevels[card.id] !== '');
  const testMatchedScenario = useMemo(() => testComplete ? findMatchingScenario(scenarios, testLevels, coreCards) : null, [testComplete, scenarios, testLevels, coreCards]);
  const testCategories = useMemo(() => [RECOMMENDATION_CATEGORIES[0], ...RECOMMENDATION_CATEGORIES.slice(1).filter((category) => testStyles.includes(category.id))], [testStyles]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (!supabase) {
        try {
          const localConfig = await getPublicConfig();
          if (!active) return;
          const normalized = ensureConfig(localConfig);
          setConfig(normalized);
          setJson(JSON.stringify(normalized, null, 2));
          savedConfigJsonRef.current = JSON.stringify(normalized);
          savedRevisionRef.current = null;
          if (normalized.scenarios[0]) setSelectedScenarioId(normalized.scenarios[0].id);
        } catch (err) {
          if (active) setError(err.message || 'Could not load preview data.');
        } finally {
          if (active) setLoading(false);
        }
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data?.session || null);
      setLoading(false);
    }
    initialize();
    if (!supabase) return () => { active = false; };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError('');
      setSuccess('');
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRemoteConfig() {
      if (!session || session.user?.app_metadata?.role !== 'admin') return;
      setLoading(true);
      setError('');
      try {
        const remote = await getPublicConfig({ strict: true });
        if (!active) return;
        const normalized = ensureConfig(remote);
        setConfig(normalized);
        setJson(JSON.stringify(normalized, null, 2));
        savedConfigJsonRef.current = JSON.stringify(normalized);
        savedRevisionRef.current = normalized.lastUpdated || null;
        setConflictDetected(false);
        setSelectedScenarioId((current) => current && normalized.scenarios.some((scenario) => scenario.id === current) ? current : normalized.scenarios[0]?.id || null);
      } catch (err) {
        if (active) setError(err.message || 'Could not load configuration.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadRemoteConfig();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    setJson(JSON.stringify(config, null, 2));
  }, [config]);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (!hasUnsavedWork) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedWork]);

  function updateConfig(mutator) {
    setConfig((current) => ensureConfig(mutator(current)));
    setSuccess('');
    setError('');
  }

  function updateScenario(patch) {
    if (!selectedScenario) return;
    updateConfig((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) => scenario.id === selectedScenario.id
        ? { ...scenario, ...(typeof patch === 'function' ? patch(scenario) : patch) }
        : scenario),
    }));
  }

  function createScenario() {
    const scenario = {
      id: makeId('scenario'),
      name: `Scenario ${scenarios.length + 1}`,
      enabled: true,
      priority: 0,
      conditions: makeEmptyConditions(coreCards),
      recommendations: makeEmptyRecommendations(),
    };
    updateConfig((current) => ({ ...current, scenarios: [...current.scenarios, scenario] }));
    setSelectedScenarioId(scenario.id);
    setActiveCategory('universal');
    setActiveTab('scenarios');
    setSuccess('Scenario created. Set the core-card conditions and recommendations.');
  }

  function duplicateScenario() {
    if (!selectedScenario) return;
    const duplicate = JSON.parse(JSON.stringify(selectedScenario));
    duplicate.id = makeId('scenario');
    duplicate.name = `Copy of ${selectedScenario.name || 'Scenario'}`;
    // Keep copies disabled until the creator reviews them, avoiding accidental public matches.
    duplicate.enabled = false;
    updateConfig((current) => ({ ...current, scenarios: [...current.scenarios, duplicate] }));
    setSelectedScenarioId(duplicate.id);
    setActiveCategory('universal');
    setSuccess('Scenario duplicated as disabled. Review its conditions, then enable it when ready.');
  }

  function deleteScenario() {
    if (!selectedScenario) return;
    if (!window.confirm(`Delete scenario "${selectedScenario.name}"? This takes effect publicly after saving.`)) return;
    const next = scenarios.filter((scenario) => scenario.id !== selectedScenario.id);
    updateConfig((current) => ({ ...current, scenarios: next }));
    setSelectedScenarioId(next[0]?.id || null);
  }

  function addRecommendation() {
    if (!selectedScenario || !newRecCardId) return;
    const currentList = selectedScenario.recommendations?.[activeCategory] || [];
    if (currentList.some((item) => String(item.cardId) === String(newRecCardId))) {
      setError('That card is already in this category. Update its status in the existing row.');
      return;
    }
    updateScenario((scenario) => ({
      recommendations: {
        ...makeEmptyRecommendations(),
        ...(scenario.recommendations || {}),
        [activeCategory]: [...(scenario.recommendations?.[activeCategory] || []), { cardId: newRecCardId, status: 'recommended', note: '' }],
      },
    }));
    setNewRecCardId('');
    setNewRecSearch('');
  }

  function updateRecommendation(index, patch) {
    updateScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      list[index] = { ...list[index], ...patch };
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }

  function removeRecommendation(index) {
    updateScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      list.splice(index, 1);
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }

  function moveRecommendation(index, direction) {
    updateScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      const destination = index + direction;
      if (destination < 0 || destination >= list.length) return {};
      [list[index], list[destination]] = [list[destination], list[index]];
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }


  function applyJson() {
    setError(''); setSuccess(''); setJsonError('');
    let parsed;
    try { parsed = JSON.parse(json); }
    catch (err) { setJsonError(`Invalid JSON: ${err.message}`); return; }
    try { validateConfig(parsed); }
    catch (err) { setJsonError(err.message); return; }
    const normalized = ensureConfig(parsed);
    setConfig(normalized);
    setSelectedScenarioId(normalized.scenarios[0]?.id || null);
    setActiveTab('scenarios');
    setSuccess('JSON validated and applied to the editor. Click Save changes to publish it.');
  }

  async function handleSave() {
    setError(''); setSuccess(''); setJsonError(''); setConflictDetected(false);
    let validated;
    try { validated = validateConfig(config); }
    catch (err) { setJsonError(err.message); setActiveTab('json'); return; }
    setSaving(true);
    try {
      const saved = await saveConfig(validated, session?.user?.id, savedRevisionRef.current);
      const normalized = ensureConfig({ ...validated, lastUpdated: saved?.lastUpdated || new Date().toISOString() });
      setConfig(normalized);
      savedConfigJsonRef.current = JSON.stringify(normalized);
      savedRevisionRef.current = localMode ? null : (saved?.lastUpdated || null);
      setSuccess(localMode
        ? 'Saved in this browser only. Changes will not be published to other visitors until Supabase is configured.'
        : 'Changes saved. The public catalog and scenarios now use the latest data.');
    } catch (err) {
      const message = err.message || 'Could not save configuration.';
      setError(message);
      if (message.toLowerCase().includes('another dashboard session') || message.toLowerCase().includes('reload the latest')) setConflictDetected(true);
    }
    finally { setSaving(false); }
  }

  async function reloadLatestConfig() {
    if (hasUnsavedWork && !window.confirm('Reload the latest saved configuration and discard all unsaved work, including any unapplied JSON draft?')) return;
    setError(''); setSuccess(''); setJsonError(''); setConflictDetected(false); setLoading(true);
    try {
      const remote = await getPublicConfig({ strict: !localMode });
      const normalized = ensureConfig(remote);
      setConfig(normalized);
      setJson(JSON.stringify(normalized, null, 2));
      savedConfigJsonRef.current = JSON.stringify(normalized);
      savedRevisionRef.current = localMode ? null : (normalized.lastUpdated || null);
      setSelectedScenarioId((current) => current && normalized.scenarios.some((scenario) => scenario.id === current) ? current : normalized.scenarios[0]?.id || null);
      setSuccess('Loaded the latest saved configuration.');
    } catch (err) {
      setError(err.message || 'Could not reload the latest configuration.');
    } finally { setLoading(false); }
  }

  function exportBackup() {
    const contents = JSON.stringify({ ...config, backupCreatedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `card-exchange-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSuccess('Backup downloaded. Store it somewhere safe before making major changes.');
  }

  async function restoreBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess(''); setJsonError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Backup file is larger than 10 MB.');
      const parsed = JSON.parse(await file.text());
      const { backupCreatedAt, ...configPayload } = parsed;
      validateConfig(configPayload);
      if (!window.confirm('Load this backup into the editor draft? Nothing will be published until you click Save changes.')) return;
      const normalized = ensureConfig(configPayload);
      setConfig(normalized);
      setJson(JSON.stringify(normalized, null, 2));
      setSelectedScenarioId(normalized.scenarios[0]?.id || null);
      setActiveCategory('universal');
      setActiveTab('scenarios');
      setSuccess('Backup loaded into the draft. Review it carefully, then click Save changes to publish.');
    } catch (err) {
      setError(`Could not restore backup: ${err.message || 'Invalid file.'}`);
    } finally {
      event.target.value = '';
    }
  }

  async function handleLogin(event) {
    event.preventDefault(); setError(''); setSuccess('');
    if (!supabase) return;
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError) return setError(loginError.message);
    if (data.user?.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut();
      return setError('Signed in, but this account does not have the admin role. Set app_metadata.role = "admin" in Supabase.');
    }
    setSession(data.session);
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) return <main className="admin-page"><div className="admin-centered"><div className="loading-pulse" /><p>Loading dashboard…</p></div></main>;

  if (!localMode && !session) return <main className="admin-page"><section className="login-panel"><a className="back-link" href="/"><ArrowLeft size={16} /> Back to selector</a><div className="setup-icon"><ShieldCheck size={25} /></div><span className="section-kicker">PRIVATE WORKSPACE</span><h1>Creator login</h1><p>Sign in to manage card data, scenarios, and recommendations. Public registration is disabled.</p><form onSubmit={handleLogin} className="login-form"><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button-primary" type="submit"><LogIn size={17} /> Sign in</button></form>{error && <div className="notice notice-error"><TriangleAlert size={17} /> {error}</div>}<p className="small-note">Create the admin account in Supabase Authentication. Make sure the account App Metadata includes the admin role.</p></section></main>;

  if (!localMode && session.user?.app_metadata?.role !== 'admin') return <main className="admin-page"><section className="setup-panel"><div className="setup-icon"><ShieldCheck size={25} /></div><h1>Admin access required</h1><p>This account is not authorized to edit the catalog.</p>{error && <div className="notice notice-error">{error}</div>}<button className="button-secondary" onClick={handleLogout}><LogOut size={16} /> Sign out</button></section></main>;

  const tabItems = [
    { id: 'scenarios', label: 'Scenario', icon: <Sparkles size={16} /> },
    { id: 'tester', label: 'Scenario Tester', icon: <FlaskConical size={16} /> },
    { id: 'backup', label: 'Backup / Restore', icon: <Download size={16} /> },
    { id: 'json', label: 'Advanced JSON', icon: <FileJson2 size={16} /> },
  ];

  return (
    <main className="admin-page admin-editor-page scenario-admin-page">
      <header className="admin-topbar">
        <a className="brand" href="/"><span className="brand-mark"><Code2 size={19} /></span><span className="brand-copy"><strong>CARD EXCHANGE</strong><small>CREATOR WORKSPACE</small></span></a>
        <div className="admin-user">{localMode ? <span className="preview-mode-pill"><Eye size={13} /> Local preview mode</span> : <><span>{session.user.email}</span><button className="button-secondary button-compact" onClick={handleLogout}><LogOut size={15} /> Sign out</button></>}</div>
      </header>
      <section className="editor-wrap scenario-editor-wrap">
        <a className="back-link" href="/"><ArrowLeft size={16} /> View public selector</a>
        <div className="editor-title-row scenario-main-title"><div><span className="section-kicker">PRIVATE / RULE WORKSPACE</span><h1>Scenario builder</h1><p>Define account conditions and select recommendations manually. The matching engine only evaluates the scenarios you create.</p></div><span className="secure-pill"><ShieldCheck size={15} /> {localMode ? 'Local preview' : 'Admin only'}</span></div>
        {localMode && <div className="notice notice-preview"><Eye size={17} /><div><strong>Local preview mode.</strong> You can test the editor and card images. Changes stay in this browser; connect Supabase to publish them to all visitors.</div></div>}

        <div className="admin-summary-strip">
          <div><span className="summary-number">{coreCards.length}</span><span className="summary-label">Core cards</span></div>
          <div><span className="summary-number">{recommendationCards.length}</span><span className="summary-label">SSR cards</span></div>
          <div><span className="summary-number">{scenarios.filter((scenario) => scenario.enabled !== false).length}</span><span className="summary-label">Active scenarios</span></div>
        </div>

        <nav className="admin-tabs" aria-label="Creator dashboard sections">
          {tabItems.map((tab) => <button type="button" className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.icon}{tab.label}</button>)}
        </nav>

        {activeTab === 'scenarios' && <div className="scenario-workbench">
          <aside className="scenario-sidebar">
            <div className="scenario-sidebar-head"><div><span className="section-kicker">SCENARIO LIST</span><h2>Scenario</h2></div><button className="icon-button add-scenario-button" title="Add scenario" aria-label="Add scenario" onClick={createScenario}><Plus size={18} /></button></div>
            {scenarios.length === 0 ? <div className="sidebar-empty"><Sparkles size={20} /><p>No scenarios yet. Create one, then configure its conditions.</p><button className="button-primary button-full" onClick={createScenario}><Plus size={16} /> Create your first scenario</button></div> : <div className="scenario-list">{scenarios.map((scenario, index) => <button key={scenario.id} className={`scenario-list-item ${selectedScenario?.id === scenario.id ? 'active' : ''}`} onClick={() => { setSelectedScenarioId(scenario.id); setSuccess(''); setError(''); }}><span className="scenario-list-index">{String(index + 1).padStart(2, '0')}</span><span className="scenario-list-copy"><strong>{scenario.name || 'Untitled scenario'}</strong><small>{summarizeCondition(scenario, coreCards)}</small></span><span className={`scenario-state-dot ${scenario.enabled === false ? 'disabled' : ''}`} title={scenario.enabled === false ? 'Disabled' : 'Active'} /></button>)}</div>}
            <div className="scenario-sidebar-foot"><p><strong>Matching order:</strong> the most specific condition wins. If tied, the higher priority wins; if still tied, list order is used.</p><button className="button-secondary button-full" onClick={createScenario}><Plus size={15} /> Add scenario</button></div>
          </aside>

          <div className="scenario-editor-panel">
            {!selectedScenario ? <div className="scenario-editor-empty"><div className="empty-icon"><Sparkles size={24} /></div><h3>Start with a scenario</h3><p>Set conditions for the six core cards, then add manual recommendations for each category. No rules are generated automatically.</p><button className="button-primary" onClick={createScenario}><Plus size={16} /> Create scenario</button></div> : <>
              <div className="scenario-edit-head"><div><span className="section-kicker">SCENARIO SETTINGS</span><h2>Scenario settings</h2><p>Match each card to a specific level or ignore its level.</p></div><div className="scenario-head-actions"><button className="button-secondary button-compact" onClick={duplicateScenario} title="Duplicate this scenario"><Copy size={14} /> Duplicate</button><button className="button-danger button-compact" onClick={deleteScenario}><Trash2 size={14} /> Delete</button></div></div>
              <div className="scenario-basic-fields">
                <label className="field-label field-full">Scenario name<input value={selectedScenario.name || ''} onChange={(event) => updateScenario({ name: event.target.value })} placeholder="Example: Kitasan LB1" /></label>
                <label className="field-label">Tie-break priority<input type="number" value={selectedScenario.priority ?? 0} onChange={(event) => updateScenario({ priority: Number(event.target.value || 0) })} /><small>Higher numbers win when match specificity is equal.</small></label>
                <label className="scenario-enabled-toggle"><input type="checkbox" checked={selectedScenario.enabled !== false} onChange={(event) => updateScenario({ enabled: event.target.checked })} /><span><strong>Active scenarios</strong><small>Disable this scenario without removing it from the editor.</small></span></label>
              </div>

              <div className="scenario-section-heading"><div><span className="section-kicker">01 / MATCH CONDITIONS</span><h3>Core-card conditions</h3></div><span className="helper-count">{coreCards.length} required cards</span></div>
              <div className="condition-list">
                {coreCards.map((card, index) => {
                  const raw = selectedScenario.conditions?.[card.id];
                  const value = raw === undefined || raw === null || raw === '*' || raw === 'ignore' ? 'any' : String(raw);
                  return <div className="condition-row" key={card.id}>
                    <div className="condition-index">{String(index + 1).padStart(2, '0')}</div>
                    <CardImage card={card} className="condition-card-image" key={`${card.id}-${card.imageUrl}`} />
                    <div className="condition-card-copy"><strong>{card.name}</strong><small>{card.type || 'Support Card'}</small></div>
                    <label className="condition-select-wrap"><span>Account condition</span><select value={value} onChange={(event) => updateScenario((scenario) => ({ conditions: { ...(scenario.conditions || {}), [card.id]: event.target.value === 'any' ? 'any' : Number(event.target.value) } }))}>{LB_CHOICES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  </div>;
                })}
              </div>
              <div className="conditions-explainer"><CheckCircle2 size={17} /><p><strong>Example:</strong> set Kitasan to LB1 and leave other cards as “Ignore” if their levels do not matter. For a scenario that applies only to a specific combination, set the relevant card conditions.</p></div>

              <div className="scenario-section-heading rec-section-heading"><div><span className="section-kicker">02 / MANUAL RECOMMENDATIONS</span><h3>Set recommendations by category</h3></div><span className="helper-count">No automatic scoring</span></div>
              <div className="recommendation-category-tabs">{RECOMMENDATION_CATEGORIES.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>{category.id !== 'universal' && <RunningStyleLogo styleId={category.id} className="recommendation-category-tab-logo" />}<span className="recommendation-category-tab-label">{category.label}</span><span className="recommendation-category-count">{(selectedScenario.recommendations?.[category.id] || []).length}</span></button>)}</div>
              <p className="category-help">{RECOMMENDATION_CATEGORIES.find((category) => category.id === activeCategory)?.description} Add cards, set their status, and add notes if useful. Row order determines the viewer display order.</p>

              <div className="add-recommendation-picker">
                <label className="field-label" htmlFor="recommendation-card-search">Find an SSR support card<input id="recommendation-card-search" type="search" value={newRecSearch} onChange={(event) => { setNewRecSearch(event.target.value); setNewRecCardId(''); }} placeholder="Type a card name, support type, or GameTora ID…" autoComplete="off" /></label>
                {selectedRecommendationCard && <div className="picker-selected"><CardImage card={selectedRecommendationCard} className="picker-selected-image" /><div><strong>{selectedRecommendationCard.name}</strong><span>{selectedRecommendationCard.type || 'Support'} · {selectedRecommendationCard.rarity || 'SSR'}</span></div><button className="button-primary" onClick={addRecommendation} disabled={!selectedScenario}><Plus size={16} /> Add to {RECOMMENDATION_CATEGORIES.find((category) => category.id === activeCategory)?.label}</button></div>}
                {newRecSearch.trim() && <div className="card-search-results" role="listbox" aria-label="Matching support cards">
                  {filteredRecommendationCards.slice(0, 12).map((card) => <button type="button" role="option" aria-selected={String(card.id) === String(newRecCardId)} className={`card-search-result ${String(card.id) === String(newRecCardId) ? 'selected' : ''}`} key={card.id} onClick={() => setNewRecCardId(String(card.id))}>
                    <CardImage card={card} className="card-search-result-image" />
                    <span className="card-search-result-copy"><strong>{card.name}</strong><small>{card.type || 'Support'}{card.rarity ? ` · ${card.rarity}` : ' · SSR'}</small></span>
                    <span className="card-search-result-id">{card.gameCardId || card.id}</span>
                  </button>)}
                  {filteredRecommendationCards.length === 0 && <p className="card-search-no-results">No cards match “{newRecSearch}”.</p>}
                  {filteredRecommendationCards.length > 12 && <p className="card-search-limit">Showing 12 of {filteredRecommendationCards.length} matches. Refine your search.</p>}
                </div>}
                {!newRecSearch.trim() && !selectedRecommendationCard && <p className="field-hint">{recommendationCards.length} SSR cards in the picker. Start typing to search; the full catalog stays out of the way until needed.</p>}
              </div>

              {activeRecommendations.length === 0 ? <div className="recommendation-editor-empty"><ImagePlus size={24} /><strong>No recommendations in this category yet</strong><p>Search the catalog above and add a card. Its image and label will appear here for review.</p></div> : <div className="recommendation-editor-list">
                {activeRecommendations.map((item, index) => {
                  const card = recommendationCards.find((candidate) => String(candidate.id) === String(item.cardId));
                  if (!card) return <div className="notice notice-error" key={`missing-${item.cardId}`}>Card with ID {item.cardId} is missing from the catalog. Remove it or fix it in Advanced JSON.</div>;
                  return <article className="recommendation-editor-item" key={`${item.cardId}-${index}`}>
                    <div className="rec-order-controls"><button className="icon-button" title="Naikkan" aria-label={`Naikkan ${card.name}`} disabled={index === 0} onClick={() => moveRecommendation(index, -1)}><ArrowUp size={14} /></button><span>{index + 1}</span><button className="icon-button" title="Turunkan" aria-label={`Turunkan ${card.name}`} disabled={index === activeRecommendations.length - 1} onClick={() => moveRecommendation(index, 1)}><ArrowDown size={14} /></button></div>
                    <CardImage card={card} className="recommendation-editor-image" key={`${card.id}-${card.imageUrl}`} />
                    <div className="recommendation-editor-fields"><div className="rec-title-row"><div><strong>{card.name}</strong><small>{card.type || 'Support Card'}</small></div><button className="icon-button icon-button-danger" title="Remove recommendation" aria-label={`Remove recommendation ${card.name}`} onClick={() => removeRecommendation(index)}><X size={16} /></button></div><label className="field-label">Recommendation status<select value={item.status || 'recommended'} onChange={(event) => updateRecommendation(index, { status: event.target.value })}><option value="recommended">Recommended</option><option value="alternative">Alternative</option></select></label><label className="field-label">Optional note<input value={item.note || ''} onChange={(event) => updateRecommendation(index, { note: event.target.value })} placeholder="Example: use this when…" /></label></div>
                  </article>;
                })}
              </div>}
              <div className="scenario-summary-note"><ShieldCheck size={17} /><p>Viewers only see a scenario that matches all six inputs. Ignored conditions do not restrict that card level. If several scenarios match, the most specific scenario wins.</p></div>
            </>}
          </div>
        </div>}

        {activeTab === 'tester' && <section className="scenario-tester-panel">
          <div className="scenario-edit-head"><div><span className="section-kicker">TEST BEFORE PUBLISHING</span><h2>Scenario tester</h2><p>Try a viewer's six core-card levels and running styles. This is a preview only; it does not change or publish the configuration.</p></div><button className="button-secondary button-compact" onClick={() => { setTestLevels({}); setTestStyles([]); }}><RotateCcw size={14} /> Reset test</button></div>
          <div className="test-inputs-grid">
            {coreCards.map((card, index) => <div className="test-input-row" key={card.id}><span className="condition-index">{String(index + 1).padStart(2, '0')}</span><CardImage card={card} className="test-card-image" /><div className="test-card-copy"><strong>{card.name}</strong><small>{card.type || 'Support card'}</small></div><label className="field-label"><span>Account level</span><select value={testLevels[card.id] ?? ''} onChange={(event) => setTestLevels((current) => ({ ...current, [card.id]: event.target.value === '' ? undefined : Number(event.target.value) }))}><option value="">Choose a level</option>{LB_CHOICES.filter((option) => option.value !== 'any').map((option) => <option key={option.value} value={option.value}>{option.value === '-1' ? option.label : option.label}</option>)}</select></label></div>)}
          </div>
          <div className="test-style-picker"><span className="field-label-title">Running styles to preview</span><div className="test-style-options">{RUNNING_STYLES.map((style) => <label key={style.id}><input type="checkbox" checked={testStyles.includes(style.id)} onChange={(event) => setTestStyles((current) => event.target.checked ? [...current, style.id] : current.filter((id) => id !== style.id))} /><RunningStyleLogo styleId={style.id} className="test-style-option-logo" />{style.label}</label>)}</div></div>
          {!testComplete ? <div className="notice notice-preview"><FlaskConical size={17} /><span>Select a level for all six core cards to run the test.</span></div> : !testMatchedScenario ? <div className="notice notice-error"><TriangleAlert size={17} /><span>No scenario matches this test input. Try another combination or create a scenario.</span></div> : <div className="test-result-wrap"><div className="test-result-heading"><div><span className="section-kicker">MATCH FOUND IN DRAFT</span><h3>{testMatchedScenario.name}</h3><p>Priority {Number(testMatchedScenario.priority || 0)} · {testMatchedScenario.enabled === false ? 'Disabled' : 'Active'}</p></div><span className="secure-pill"><CheckCircle2 size={14} /> Match</span></div><div className="results-category-list">{testCategories.map((category) => { const items = getScenarioRecommendations(testMatchedScenario, category.id); return <section key={category.id} className="test-preview-category"><div className="test-preview-category-head"><div className="test-preview-category-title">{category.id !== 'universal' && <RunningStyleLogo styleId={category.id} className="test-preview-category-logo" />}<strong>{category.label}</strong></div><span>{items.length} cards</span></div>{items.length === 0 ? <p className="small-note">No recommendations configured for this category.</p> : <div className="test-preview-items">{items.map((item, index) => { const card = recommendationCards.find((candidate) => String(candidate.id) === String(item.cardId)); if (!card) return null; return <div className="test-preview-item" key={`${category.id}-${item.cardId}-${index}`}><CardImage card={card} className="test-preview-image" /><div><strong>{card.name}</strong><small>{item.status === 'alternative' ? 'Alternative' : 'Recommended'}{item.note ? ` · ${item.note}` : ''}</small></div></div>; })}</div>}</section>; })}</div></div>}
        </section>}

        {activeTab === 'backup' && <section className="backup-panel"><div className="scenario-edit-head"><div><span className="section-kicker">PORTABLE CONFIGURATION</span><h2>Backup / Restore</h2><p>Export the catalog and scenarios to a JSON file, or load a previous backup into the current draft.</p></div></div><div className="backup-actions-grid"><article className="backup-action"><Download size={22} /><h3>Export a backup</h3><p>Download all card catalog metadata and creator scenarios. This file does not contain your Supabase login credentials.</p><button className="button-primary" onClick={exportBackup}><Download size={16} /> Download backup JSON</button></article><article className="backup-action"><Upload size={22} /><h3>Restore from JSON</h3><p>Load a previously exported configuration. The imported data stays in the editor draft until you save it.</p><input ref={restoreInputRef} className="visually-hidden-file" type="file" accept=".json,application/json" onChange={restoreBackupFile} /><button className="button-secondary" onClick={() => restoreInputRef.current?.click()}><Upload size={16} /> Choose backup file</button><small>Maximum file size: 10 MB. The file must pass configuration validation.</small></article></div><div className="notice notice-preview"><ShieldCheck size={17} /><div><strong>Recommended workflow:</strong> download a backup before bulk edits, load a backup to preview it, verify its scenarios, and then publish with Save changes. Restoring does not delete or replace the live database until you save.</div></div></section>}

        {activeTab === 'json' && <section className="json-advanced-panel"><div className="scenario-edit-head"><div><span className="section-kicker">ADVANCED CONFIG</span><h2>Advanced JSON</h2><p>Use this for bulk edits or structural changes. Use the scenario editor for routine updates.</p></div></div><div className="editor-toolbar"><span><Code2 size={16} /> app-config.json</span><span>JSON · UTF-8</span></div><textarea className="json-editor advanced-json-editor" value={json} onChange={(event) => { setJson(event.target.value); setJsonError(''); setSuccess(''); }} spellCheck="false" aria-label="Configuration JSON editor" />{jsonError && <div className="notice notice-error"><TriangleAlert size={17} /> {jsonError}</div>}<div className="editor-actions"><span className="small-note">Validate and apply JSON to the visual editor. Changes are published only after saving.</span><button className="button-secondary" onClick={applyJson}><CheckCircle2 size={16} /> Validate & apply JSON</button></div></section>}

        {error && <div className="notice notice-error admin-global-notice"><TriangleAlert size={17} /><div>{error}{conflictDetected && <div className="conflict-actions"><button className="button-secondary button-compact" onClick={reloadLatestConfig}><RotateCcw size={14} /> Load latest version (discard draft)</button></div>}</div></div>}
        {success && <div className="notice notice-success admin-global-notice"><CheckCircle2 size={17} /> {success}</div>}
        <div className="admin-sticky-save"><div><strong>{localMode ? 'Preview changes' : 'Dashboard changes'}</strong><span className={hasUnsavedWork ? 'save-state-pending' : 'save-state-clean'}>{hasUnappliedJsonDraft ? 'Unapplied JSON draft · validate & apply first' : hasUnsavedChanges ? 'Unsaved changes · save before leaving' : (localMode ? 'Saved in this browser only' : 'All changes saved')}</span></div><button className="button-primary" onClick={handleSave} disabled={saving || !hasUnsavedChanges || hasUnappliedJsonDraft}><Save size={17} /> {saving ? 'Saving...' : 'Save changes'}</button></div>
        <div className="editor-footnote"><TriangleAlert size={17} /><p>The creator defines all rules. The website only matches conditions: the most specific scenario wins. Priority resolves equally specific matches. Images load from the stored GameTora URL and show a fallback if the image is unavailable.</p></div>
      </section>
    </main>
  );
}
