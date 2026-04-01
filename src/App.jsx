import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Building2, Calendar, CheckCircle2,   LayoutDashboard, Plus, AlertCircle, 
  Check, Zap, X, User, MapPin, 
  Plane, Ban, Save, RefreshCw, UserCheck,   Sun, Moon, Settings, Network, ArrowLeft, Bed, Search, Gift, Landmark
} from 'lucide-react';
import { auth } from './lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// --- 辅助函数 ---
const toLocalISODate = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString().slice(0, 16);
const fmtDate = (str) => {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const getWeekday = (d) => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
const hoursLeft = (str) => (new Date(str) - new Date()) / 36e5;
const isOverdue = (str) => hoursLeft(str) < 0;
const isSoon = (str) => {
  const h = hoursLeft(str);
  return h >= 0 && h <= 24;
};

const extractKeyword = (title) => {
  if (!title) return '未知';
  const dict = ['方案', '排期', '合同', '预算', '纪要', '发票', '路演', '需求', '材料', '报表', '会议', '商谈', '视察', '巡检', '对接', '审核'];
  for (let k of dict) if (title.includes(k)) return k;
  if (title.length <= 4) return title;
  return title.slice(0, 4) + '..';
};



const generateDisplayId = (track, allTasks) => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearTasks = allTasks.filter(t => t.track === track && t.displayId && t.displayId.startsWith(yy));
  let maxSeq = 0;
  currentYearTasks.forEach(t => {
    const parts = t.displayId.split('-');
    if (parts.length >= 2) {
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });
  return `${yy}${mm}-${String(maxSeq + 1).padStart(2, '0')}`;
};

// --- 初始数据 ---
const INITIAL_COMPANIES = [];
const INITIAL_TASKS = [];
const INITIAL_EVENTS = [];
export default function App() {
 const [isDarkMode, setIsDarkMode] = useState(true);
const [activeTrack, setActiveTrack] = useState('company');

 const [isLoggedIn, setIsLoggedIn] = useState(false);
const [currentUser, setCurrentUser] = useState(null);
const [authMode, setAuthMode] = useState('login');
const [authForm, setAuthForm] = useState({
  email: '',
  password: '',
  confirmPassword: '',
});

const handleAuthInput = (e) => {
  const { name, value } = e.target;
  setAuthForm((prev) => ({ ...prev, [name]: value }));
};

const handleRegister = async () => {
  if (!authForm.email.trim() || !authForm.password.trim()) {
    showMessage('请输入邮箱和密码', 'error');
    return;
  }

  if (authForm.password !== authForm.confirmPassword) {
    showMessage('两次密码不一致', 'error');
    return;
  }

  try {
    await createUserWithEmailAndPassword(
      auth,
      authForm.email.trim(),
      authForm.password
    );
    showMessage('注册成功', 'success');
    setAuthForm({ email: '', password: '', confirmPassword: '' });
  }catch (error) {
  console.log('register error:', error);
  console.log('register error code:', error.code);
  console.log('register error message:', error.message);
  showMessage(error.code || '注册失败', 'error');
}
};

const handleLogin = async () => {
  if (!authForm.email.trim() || !authForm.password.trim()) {
    showMessage('请输入邮箱和密码', 'error');
    return;
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      authForm.email.trim(),
      authForm.password
    );
    showMessage('登录成功', 'success');
  } catch (error) {
    showMessage('邮箱或密码错误', 'error');
  }
};

const handleLogout = async () => {
  try {
    await signOut(auth);
    setAuthMode('login');
    setAuthForm({ email: '', password: '', confirmPassword: '' });
    showMessage('已退出登录', 'success');
  } catch (error) {
    showMessage('退出失败', 'error');
  }
};


useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    setCurrentUser(user);
    setIsLoggedIn(!!user);
  });

  return () => unsubscribe();
}, []);
  
  const [activeSubTrack, setActiveSubTrack] = useState('itinerary');
  
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [events, setEvents] = useState(INITIAL_EVENTS); 
  const [companies, setCompanies] = useState(INITIAL_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [toast, setToast] = useState(null);
  
  const [formData, setFormData] = useState({
    company: '', displayId: '', title: '', purposes: [], 
    contact: '', meetWho: '', locations: [], deadline: '', priority: '中', note: '',
    transportation: '', accommodation: '', eventType: 'exhibition'
  });
  const [locInput, setLocInput] = useState('');
  const [purposeInput, setPurposeInput] = useState(''); 
  const [editingId, setEditingId] = useState(null);
  const [tempDisplayId, setTempDisplayId] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const formRef = useRef(null);

  // --- DIY 用户设置 ---
  const [showSettings, setShowSettings] = useState(false);
  const [uiPrefs, setUiPrefs] = useState({
    fontSize: 'text-sm', spacing: 'p-5',
    showTableCols: { id: true, time: true, context: true, purpose: true, action: true },
    timelineCompanyDisplay: 'keyword', 
    timelineTripShow: { purposes: true, transport: true, accommodation: true }
  });

  const [explorerState, setExplorerState] = useState({ active: false, centerNode: null, history: [] });
  const [searchInput, setSearchInput] = useState('');

  // --- 时间轴状态 ---
  const [timelineStart, setTimelineStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); 
    return toLocalISODate(d);
  });
  const [timelineEnd, setTimelineEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6); 
    return toLocalISODate(d);
  });

  const timelineDays = useMemo(() => {
    const days = [];
    const start = new Date(timelineStart + "T00:00:00");
    const end = new Date(timelineEnd + "T00:00:00");
    if (end < start) return [timelineStart];
    let current = new Date(start);
    while(current <= end && days.length < 60) {
      days.push(toLocalISODate(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [timelineStart, timelineEnd]);

  // --- 派生数据 ---
  const currentTasks = useMemo(() => tasks.filter(t => t.track === activeTrack), [tasks, activeTrack]);
  const stats = useMemo(() => {
    const undone = currentTasks.filter(t => t.status === 'todo');
    return {
      total: currentTasks.length, undoneCount: undone.length,
      overdueCount: undone.filter(t => isOverdue(t.deadline)).length,
      cancelledCount: currentTasks.filter(t => t.status === 'cancelled').length
    };
  }, [currentTasks]);

  const sortedEvents = useMemo(() => [...events].sort((a,b) => new Date(a.date) - new Date(b.date)), [events]);

  const filteredCompanyTasks = useMemo(() => {
    if (activeTrack !== 'company') return [];
    const list = selectedCompany === 'all' ? currentTasks : currentTasks.filter(t => t.company === selectedCompany);
    const statusWeight = { 'todo': 0, 'done': 1, 'cancelled': 2 };
    return [...list].sort((a, b) => statusWeight[a.status] - statusWeight[b.status] || new Date(a.deadline) - new Date(b.deadline));
  }, [currentTasks, selectedCompany, activeTrack]);

  const sortedTripTasks = useMemo(() => {
    if (activeTrack !== 'trip') return [];
    const statusWeight = { 'todo': 0, 'done': 1, 'cancelled': 2 };
    return [...currentTasks].sort((a, b) => statusWeight[a.status] - statusWeight[b.status] || new Date(a.deadline) - new Date(b.deadline));
  }, [currentTasks, activeTrack]);

  // --- 操作逻辑 ---
  const showMessage = (msg, type = 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const changeTaskStatus = (id, targetStatus) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: targetStatus } : t));
  
  const handleReschedule = (taskToCopy) => {
    setFormData({
      company: taskToCopy.company || INITIAL_COMPANIES[0], displayId: '', title: taskToCopy.title || '',
      purposes: [...(taskToCopy.purposes||[])], contact: taskToCopy.contact || '', meetWho: taskToCopy.meetWho || '',
      locations: [...taskToCopy.locations], deadline: '', priority: taskToCopy.priority, note: taskToCopy.note,
      transportation: taskToCopy.transportation || '', accommodation: taskToCopy.accommodation || '', eventType: 'exhibition'
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
    showMessage('已提取，请设定新时间重排', 'success');
  };

  const handleAddLocation = (e) => {
    e?.preventDefault(); if (!locInput.trim()) return;
    if (!formData.locations.includes(locInput.trim())) setFormData(p => ({ ...p, locations: [...p.locations, locInput.trim()] }));
    setLocInput('');
  };
  const removeLocation = (locToRemove) => setFormData(p => ({ ...p, locations: p.locations.filter(l => l !== locToRemove) }));
  
  const handleAddPurpose = (e) => {
    e?.preventDefault(); if (!purposeInput.trim()) return;
    if (!formData.purposes.includes(purposeInput.trim())) setFormData(p => ({ ...p, purposes: [...p.purposes, purposeInput.trim()] }));
    setPurposeInput('');
  };
  const removePurpose = (pToRemove) => setFormData(p => ({ ...p, purposes: p.purposes.filter(p => p !== pToRemove) }));
  
  const handleFormChange = (e) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
  const saveDisplayId = (id) => {
    if(!tempDisplayId.trim()) return;
    setTasks(p => p.map(t => t.id === id ? { ...t, displayId: tempDisplayId.trim() } : t));
    setEditingId(null);
  };

  const handleAddTask = () => {
    if (activeTrack === 'trip' && activeSubTrack === 'events') {
      if (!formData.title.trim() || !formData.deadline) return showMessage('请填写名称和日期', 'error');
      const newEvent = {
        id: Date.now(), date: formData.deadline.split('T')[0], name: formData.title.trim(),
        location: locInput.trim() || '无', type: formData.eventType
      };
      setEvents(p => [...p, newEvent]); showMessage('事件已存入参考库', 'success');
      setFormData(p => ({ ...p, title: '', deadline: '' })); setLocInput('');
      return;
    }

    let fl = [...formData.locations]; if (locInput.trim() && !fl.includes(locInput.trim())) fl.push(locInput.trim());
    let fp = [...formData.purposes]; if (purposeInput.trim() && !fp.includes(purposeInput.trim())) fp.push(purposeInput.trim());
    if (activeTrack === 'company' && !formData.title.trim()) return showMessage('请填写标题', 'error');
    if (activeTrack === 'trip' && fp.length === 0) return showMessage('需至少填写一件事由', 'error');
    if (!formData.deadline) return showMessage('请填写时间', 'error');

    if (activeTrack === 'company' && formData.company.trim() && !companies.includes(formData.company.trim())) {
      setCompanies(prev => [...prev, formData.company.trim()]);
    }

    const finalDisplayId = formData.displayId.trim() || generateDisplayId(activeTrack, tasks);
    
    const newTask = {
      id: Date.now(), displayId: finalDisplayId,
      track: activeTrack, company: activeTrack === 'company' ? formData.company : null, 
      title: activeTrack === 'company' ? formData.title.trim() : '', purposes: activeTrack === 'trip' ? fp : [],
      contact: activeTrack === 'company' ? formData.contact.trim() : '', meetWho: activeTrack === 'trip' ? formData.meetWho.trim() : '',
      locations: fl, deadline: formData.deadline, priority: formData.priority, status: 'todo', note: formData.note.trim(),
      transportation: activeTrack === 'trip' ? formData.transportation.trim() : '',
      accommodation: activeTrack === 'trip' ? formData.accommodation.trim() : ''
    };
    setTasks(p => [newTask, ...p]); showMessage('已落库', 'success');
    setFormData(p => ({ ...p, displayId: '', title: '', contact: '', meetWho: '', note: '', locations: [], purposes: [], deadline: '', transportation: '', accommodation: '' }));
    setLocInput(''); setPurposeInput('');
  };

  const scrollToTask = (id) => {
    const el = document.getElementById(`task-${id}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHighlightId(id); setTimeout(() => setHighlightId(null), 1500); }
  };

  // --- 全局检索与图谱引擎 ---
  const handleGlobalSearch = (query) => {
    if (!query.trim()) return;
    const q = query.trim().toLowerCase();
    let matchNode = null;
    
    const compMatch = companies.find(c => c.toLowerCase().includes(q));
    if (compMatch) matchNode = { type: 'company', value: compMatch };
    
    if (!matchNode) {
      const allLocs = [...new Set(tasks.flatMap(t => t.locations))];
      const locMatch = allLocs.find(l => l.toLowerCase().includes(q));
      if (locMatch) matchNode = { type: 'location', value: locMatch };
    }
    if (!matchNode) {
      const allPersons = [...new Set(tasks.flatMap(t => [t.contact, t.meetWho]).filter(Boolean))];
      const pMatch = allPersons.find(p => p.toLowerCase().includes(q));
      if (pMatch) matchNode = { type: 'person', value: pMatch };
    }
    if (!matchNode) {
      const tMatch = tasks.find(t => (t.title && t.title.toLowerCase().includes(q)) || (t.purposes && t.purposes.some(p => p.toLowerCase().includes(q))));
      if (tMatch) matchNode = { type: 'task', value: tMatch.title || tMatch.purposes[0], id: tMatch.id };
    }

    if (matchNode) {
      openExplorer(matchNode);
      setSearchInput('');
    } else {
      showMessage('未在全库中检索到相关实体或任务', 'error');
    }
  };

  const openExplorer = (node) => setExplorerState(prev => ({ active: true, centerNode: node, history: prev.centerNode ? [...prev.history, prev.centerNode] : [] }));
  const closeExplorer = () => setExplorerState({ active: false, centerNode: null, history: [] });
  const goBackExplorer = () => setExplorerState(prev => { const newHistory = [...prev.history]; const prevNode = newHistory.pop(); return { ...prev, centerNode: prevNode || null, history: newHistory }; });

  const graphData = useMemo(() => {
    if (!explorerState.centerNode) return { center: null, childNodes: [] };
    const center = explorerState.centerNode;
    let relatedTasks = [];
    
    if (center.type === 'task') relatedTasks = tasks.filter(t => t.id === center.id);
    else if (center.type === 'person') relatedTasks = tasks.filter(t => t.contact === center.value || t.meetWho === center.value);
    else if (center.type === 'location') relatedTasks = tasks.filter(t => t.locations.includes(center.value));
    else if (center.type === 'company') relatedTasks = tasks.filter(t => t.company === center.value);

    const childrenSet = new Map();
    relatedTasks.forEach(t => {
      if (center.type !== 'task' || center.id !== t.id) {
        childrenSet.set(`task_${t.id}`, { type: 'task', value: t.title || t.purposes[0], id: t.id, status: t.status });
      }
      if (t.company && (center.type !== 'company' || center.value !== t.company)) childrenSet.set(`company_${t.company}`, { type: 'company', value: t.company });
      if (t.contact && (center.type !== 'person' || center.value !== t.contact)) childrenSet.set(`person_${t.contact}`, { type: 'person', value: t.contact });
      if (t.meetWho && (center.type !== 'person' || center.value !== t.meetWho)) childrenSet.set(`person_${t.meetWho}`, { type: 'person', value: t.meetWho });
      t.locations.forEach(loc => { 
        if (center.type !== 'location' || center.value !== loc) childrenSet.set(`loc_${loc}`, { type: 'location', value: loc }); 
      });
    });
    
    return { center, childNodes: Array.from(childrenSet.values()) };
  }, [explorerState.centerNode, tasks]);

  const currentFont = {
    'text-xs': { main: 'text-xs', large: 'text-sm' },
    'text-sm': { main: 'text-sm', large: 'text-base' },
    'text-base': { main: 'text-base', large: 'text-lg' }
  }[uiPrefs.fontSize];

  if (!isLoggedIn) {
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-300 relative">
        <div className="absolute top-4 right-6 flex items-center gap-3 text-xs">
          <button
            onClick={() => setAuthMode('login')}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            登录
          </button>
          <button
            onClick={() => setAuthMode('register')}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            注册
          </button>
        </div>

        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6">
            <h1 className="text-xl font-bold mb-6">
              {authMode === 'login' ? '登录' : '注册'}
            </h1>

            <div className="space-y-4">
              <input
                name="email"
                value={authForm.email}
                onChange={handleAuthInput}
                placeholder="邮箱"
                className="w-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none"
              />
              <input
                type="password"
                name="password"
                value={authForm.password}
                onChange={handleAuthInput}
                placeholder="密码"
                className="w-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none"
              />
              {authMode === 'register' && (
                <input
                  type="password"
                  name="confirmPassword"
                  value={authForm.confirmPassword}
                  onChange={handleAuthInput}
                  placeholder="确认密码"
                  className="w-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none"
                />
              )}

              {authMode === 'login' ? (
                <button
                  onClick={handleLogin}
                  className="w-full bg-zinc-900 dark:bg-white dark:text-black text-white py-2 font-bold"
                >
                  登录
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  className="w-full bg-zinc-900 dark:bg-white dark:text-black text-white py-2 font-bold"
                >
                  注册
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className={`min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-300 font-sans flex flex-col md:flex-row relative transition-colors duration-300 ${currentFont.main}`}>
        
        {/* 全局提示 */}
        {toast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold shadow-2xl border border-zinc-200 dark:border-zinc-700">
              {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {toast.msg}
            </div>
          </div>
        )}

        {/* 关系图谱漫游器 */}
        {explorerState.active && graphData.center && (
          <div className="fixed inset-0 z-[90] bg-zinc-50/95 dark:bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
            <div className="absolute top-6 left-6 flex gap-4">
              <button onClick={closeExplorer} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-full hover:scale-105 transition-transform"><X size={20}/></button>
              {explorerState.history.length > 0 && <button onClick={goBackExplorer} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-full hover:scale-105 transition-transform"><ArrowLeft size={20}/></button>}
            </div>
            
            <h2 className="absolute top-8 font-mono tracking-widest text-zinc-400 text-xs md:text-sm text-center px-4">
              ENTITY EXPLORER<br/>点击任意节点无限发散
            </h2>

            <div className="relative w-[320px] h-[320px] md:w-[600px] md:h-[600px] flex items-center justify-center mt-8">
               <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50 dark:opacity-30">
                  {graphData.childNodes.map((_, i) => {
                    const angle = (i / graphData.childNodes.length) * 2 * Math.PI;
                    const r = window.innerWidth < 768 ? 130 : 240;
                    const x2 = 50 + Math.cos(angle) * (r / (window.innerWidth < 768 ? 320 : 600)) * 100;
                    const y2 = 50 + Math.sin(angle) * (r / (window.innerWidth < 768 ? 320 : 600)) * 100;
                    return <line key={i} x1="50%" y1="50%" x2={`${x2}%`} y2={`${y2}%`} stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" />
                  })}
               </svg>
               <div className="absolute z-10 px-6 py-4 bg-zinc-900 text-white dark:bg-white dark:text-black border-2 border-zinc-900 dark:border-white font-bold shadow-2xl flex flex-col items-center justify-center text-center max-w-[180px] md:max-w-[220px] break-words">
                 <span className="text-[10px] uppercase tracking-widest opacity-70 mb-1">{graphData.center.type}</span>
                 {graphData.center.value}
               </div>
               {graphData.childNodes.map((node, i) => {
                 const angle = (i / graphData.childNodes.length) * 2 * Math.PI;
                 const r = window.innerWidth < 768 ? 130 : 240; 
                 const x = Math.cos(angle) * r;
                 const y = Math.sin(angle) * r;
                 const typeColors = {
                   'person': 'border-blue-500 text-blue-700 dark:text-blue-300',
                   'location': 'border-amber-500 text-amber-700 dark:text-amber-300',
                   'company': 'border-emerald-500 text-emerald-700 dark:text-emerald-300',
                   'task': 'border-zinc-400 text-zinc-800 dark:text-zinc-200'
                 };
                 return (
                   <button 
                     key={i} onClick={() => openExplorer(node)}
                     className={`absolute px-3 py-1.5 bg-white dark:bg-zinc-900 border-l-4 shadow-md font-bold text-xs truncate max-w-[120px] md:max-w-[160px] hover:scale-110 transition-transform cursor-pointer ${typeColors[node.type]}`}
                     style={{ transform: `translate(${x}px, ${y}px)` }}
                   >{node.value}</button>
                 );
               })}
               {graphData.childNodes.length === 0 && <div className="absolute bottom-0 text-zinc-500 font-mono text-sm">No further connections.</div>}
            </div>
          </div>
        )}

        {/* DIY 设置面板 */}
        {showSettings && (
          <div className="fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#111] border-l border-zinc-200 dark:border-zinc-800 z-50 shadow-2xl p-6 flex flex-col animate-in slide-in-from-right">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-bold uppercase tracking-widest text-zinc-900 dark:text-white flex items-center gap-2"><Settings size={18}/> 全局偏好设置</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"><X size={16}/></button>
            </div>
            
            <div className="space-y-8 flex-1 overflow-y-auto pr-2">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-3">基础显示设定</label>
                <div className="space-y-3">
                  <div className="flex gap-2 bg-zinc-100 dark:bg-black p-1 border border-zinc-200 dark:border-zinc-800">
                    {['text-xs', 'text-sm', 'text-base'].map(sz => (
                      <button key={sz} onClick={() => setUiPrefs(p => ({...p, fontSize: sz}))} className={`flex-1 py-1 text-xs font-bold ${uiPrefs.fontSize === sz ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>
                        {sz === 'text-xs' ? '小字' : sz === 'text-sm' ? '标准' : '大字'}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 bg-zinc-100 dark:bg-black p-1 border border-zinc-200 dark:border-zinc-800">
                    {[{k:'p-3', l:'紧凑'}, {k:'p-5', l:'标准'}, {k:'p-7', l:'宽松'}].map(sp => (
                      <button key={sp.k} onClick={() => setUiPrefs(p => ({...p, spacing: sp.k}))} className={`flex-1 py-1 text-xs font-bold ${uiPrefs.spacing === sp.k ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>
                        {sp.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-3">常规业务·时间轴显示偏好</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'keyword', label: '提取关键词' },
                    { val: 'company', label: '显示公司名' },
                    { val: 'contact', label: '显示对接人' },
                    { val: 'location', label: '显示地点' }
                  ].map(opt => (
                    <button 
                      key={opt.val} 
                      onClick={() => setUiPrefs(p => ({...p, timelineCompanyDisplay: opt.val}))}
                      className={`py-2 px-3 text-xs font-bold text-left border ${uiPrefs.timelineCompanyDisplay === opt.val ? 'border-zinc-900 text-zinc-900 dark:border-white dark:text-white bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-3">Trip 行程·时间轴泳道偏好</label>
                <div className="flex flex-col gap-2">
                  {Object.entries({purposes: '保留【事务安排】', transport: '保留【交通出行】', accommodation: '保留【住宿酒店】'}).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" checked={uiPrefs.timelineTripShow[key]} 
                        onChange={(e) => setUiPrefs(p => ({...p, timelineTripShow: {...p.timelineTripShow, [key]: e.target.checked}}))}
                        className="w-4 h-4 accent-zinc-900 dark:accent-white"
                      />
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-3">Trip 行程·表格可见列</label>
                <div className="flex flex-col gap-2">
                  {Object.entries({id: '编号 ID', time: '时间 Time', context: '节点 Nodes', purpose: '事由 Purpose', action: '操作 Actions'}).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" checked={uiPrefs.showTableCols[key]} 
                        onChange={(e) => setUiPrefs(p => ({...p, showTableCols: {...p.showTableCols, [key]: e.target.checked}}))}
                        className="w-4 h-4 accent-zinc-900 dark:accent-white"
                      />
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 移动端导航 */}
        <div className="md:hidden bg-white dark:bg-black text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-900 shrink-0 sticky top-0 z-30">
          <div className="p-4 pb-2 font-bold flex flex-wrap justify-between items-center tracking-widest uppercase gap-3">
            <div className="flex items-center gap-2"><Zap size={16} /> 记事本</div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1.5 rounded-full flex-1 max-w-[160px]">
                <Search size={12} className="text-zinc-400 shrink-0" />
                <input 
                  type="text" value={searchInput} onChange={e=>setSearchInput(e.target.value)}
                  onKeyDown={e => {if(e.key === 'Enter') handleGlobalSearch(searchInput)}}
                  placeholder="搜人名/地点/公司..." 
                  className="bg-transparent border-none outline-none text-[10px] w-full text-zinc-900 dark:text-white"
                />
              </div>
              <button onClick={() => setShowSettings(true)} className="p-1.5"><Settings size={14}/></button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-1.5">
                {isDarkMode ? <Sun size={14} className="text-zinc-400" /> : <Moon size={14} className="text-zinc-600" />}
              </button>
            </div>
          </div>
          <div className="px-4 pb-4">
            <div className="flex border border-zinc-200 dark:border-zinc-800 p-1 bg-zinc-100 dark:bg-[#050505]">
              <button onClick={() => { setActiveTrack('company'); setActiveSubTrack('itinerary'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-bold uppercase tracking-wider transition-colors ${activeTrack === 'company' ? 'bg-white text-zinc-900 border border-zinc-300 dark:bg-white dark:text-black dark:border-transparent shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white'}`}><Building2 size={14} /> 常规业务</button>
              <button onClick={() => setActiveTrack('trip')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-bold uppercase tracking-wider transition-colors ${activeTrack === 'trip' ? 'bg-white text-zinc-900 border border-zinc-300 dark:bg-white dark:text-black dark:border-transparent shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white'}`}><Plane size={14} /> Trip 行程</button>
            </div>
          </div>
        </div>

        {/* 桌面端侧边栏 */}
        <aside className="hidden md:flex flex-col w-[260px] bg-white dark:bg-black border-r border-zinc-200 dark:border-zinc-900 p-6 shrink-0 z-10 relative">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="font-bold text-zinc-900 dark:text-white tracking-widest uppercase flex items-center gap-2 mb-3"><Zap size={18} /> 记事本</h1>
              <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">SYS.DUAL_TRACK_MODE<br/>STATUS: ACTIVE</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => setShowSettings(true)} className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><Settings size={14}/></button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group">
                {isDarkMode ? <Sun size={14} className="text-zinc-500 group-hover:text-white" /> : <Moon size={14} className="text-zinc-600 group-hover:text-black" />}
              </button>
            </div>
          </div>
          
          <div className="mb-8">
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-full shadow-inner focus-within:ring-1 focus-within:ring-zinc-400 transition-all">
              <Search size={14} className="text-zinc-400 shrink-0" />
              <input 
                type="text" value={searchInput} onChange={e=>setSearchInput(e.target.value)}
                onKeyDown={e => {if(e.key === 'Enter') handleGlobalSearch(searchInput)}}
                placeholder="搜人名/地点/公司 (回车)..." 
                className="bg-transparent border-none outline-none text-xs w-full text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600"
              />
            </div>
          </div>

          <nav className="flex flex-col gap-2 font-medium">
            <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-600 uppercase tracking-widest pl-2 mb-2">Workspace</div>
            <button onClick={() => { setActiveTrack('company'); setActiveSubTrack('itinerary'); }} className={`flex items-center gap-3 px-4 py-3 transition-all relative group ${activeTrack === 'company' ? 'bg-zinc-100 text-zinc-900 border border-zinc-300 dark:bg-zinc-900 dark:text-white dark:border-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent dark:text-zinc-500 dark:hover:text-white dark:hover:bg-[#0a0a0a]'}`}>
              {activeTrack === 'company' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-900 dark:bg-white"></div>}
              <Building2 size={16} /> <span className="font-bold tracking-wide">常规业务</span>
            </button>
            <button onClick={() => setActiveTrack('trip')} className={`flex items-center gap-3 px-4 py-3 transition-all relative group ${activeTrack === 'trip' ? 'bg-zinc-100 text-zinc-900 border border-zinc-300 dark:bg-zinc-900 dark:text-white dark:border-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent dark:text-zinc-500 dark:hover:text-white dark:hover:bg-[#0a0a0a]'}`}>
              {activeTrack === 'trip' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-zinc-900 dark:bg-white"></div>}
              <Plane size={16} /> <span className="font-bold tracking-wide">Trip 行程</span>
            </button>
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-zinc-50 dark:bg-black">
          
          <header className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-3">
                <h2 className={`${currentFont.large} font-bold text-zinc-900 dark:text-white uppercase tracking-widest`}>
                  {activeTrack === 'company' ? '常规业务轨道' : 'Trip 综合看板'}
                </h2>
                {activeTrack === 'trip' && (
                  <div className="flex bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 ml-4">
                    <button 
                      onClick={() => setActiveSubTrack('itinerary')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${activeSubTrack === 'itinerary' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                    >行程单流水</button>
                    <button 
                      onClick={() => setActiveSubTrack('events')}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-all ${activeSubTrack === 'events' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                    >展会与纪念日</button>
                  </div>
                )}
              </div>
            </div>

            {/* 统计区 */}
            {activeSubTrack === 'itinerary' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className={`bg-white dark:bg-[#0a0a0a] ${uiPrefs.spacing} border border-zinc-200 dark:border-zinc-900`}>
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{activeTrack === 'company' ? '在办任务' : '累计出行(次)'}</span>
                  <div className="text-2xl font-light mt-2 text-zinc-900 dark:text-white font-mono">{String(activeTrack === 'company' ? stats.undoneCount : stats.total).padStart(2, '0')}</div>
                </div>
                <div className={`bg-white dark:bg-[#0a0a0a] ${uiPrefs.spacing} border border-zinc-200 dark:border-zinc-900`}>
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{activeTrack === 'company' ? '已逾期' : '待出行'}</span>
                  <div className="text-2xl font-light mt-2 text-zinc-900 dark:text-white font-mono">{String(activeTrack === 'company' ? stats.overdueCount : stats.undoneCount).padStart(2, '0')}</div>
                </div>
                <div className={`bg-white dark:bg-[#0a0a0a] ${uiPrefs.spacing} border border-zinc-200 dark:border-zinc-900`}>
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{activeTrack === 'company' ? '已废止' : '待重排(已废止)'}</span>
                  <div className="text-2xl font-light mt-2 text-zinc-400 dark:text-zinc-600 font-mono">{String(stats.cancelledCount).padStart(2, '0')}</div>
                </div>
                <div className="col-span-1 p-0 border border-zinc-300 dark:border-zinc-800 flex items-center justify-center bg-white dark:bg-transparent">
                  <button onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })} className="w-full h-full min-h-[60px] font-bold text-white bg-zinc-900 dark:bg-black flex items-center justify-center gap-2 uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-900 transition-colors">
                    <Plus size={16} /> 新增
                  </button>
                </div>
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-7 space-y-8">
              
              {activeTrack === 'trip' && activeSubTrack === 'events' ? (
                // =======================================
                // 展会与纪念日 独立参考列表
                // =======================================
                <section className={`bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 ${uiPrefs.spacing}`}>
                  <div className="mb-6 border-b border-zinc-200 dark:border-zinc-900 pb-4 flex justify-between items-center">
                    <h3 className="font-bold text-zinc-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                      <Landmark size={16} /> 展会与重要日子 (静态参考)
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 text-[10px] uppercase bg-zinc-50 dark:bg-black">
                          <th className="p-4 font-bold w-32">日期</th>
                          <th className="p-4 font-bold">内容名称</th>
                          <th className="p-4 font-bold">地点/备注</th>
                          <th className="p-4 font-bold w-12 text-center">类型</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedEvents.length === 0 ? <tr><td colSpan="4" className="p-12 text-center text-zinc-400">暂无参考信息</td></tr> : sortedEvents.map(ev => (
                          <tr key={ev.id} className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-[#0a0a0a] transition-colors">
                            <td className="p-4 font-mono font-bold text-zinc-900 dark:text-zinc-200">{ev.date}</td>
                            <td className="p-4 font-bold text-zinc-800 dark:text-white">{ev.name}</td>
                            <td className="p-4 text-zinc-500">{ev.location}</td>
                            <td className="p-4 text-center">
                              {ev.type === 'exhibition' ? <Landmark size={14} className="text-blue-500 mx-auto" /> : <Gift size={14} className="text-amber-500 mx-auto" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <>
                  {/* =======================================
                      自适应横向时间轴
                     ======================================= */}
                  <section className={`bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 ${uiPrefs.spacing}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h3 className="font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Calendar size={14} /> 线性排期概览
                      </h3>
                      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 p-1">
                        <input type="date" value={timelineStart} onChange={e => setTimelineStart(e.target.value)} className="bg-transparent font-mono p-1 outline-none text-zinc-900 dark:text-white cursor-pointer"/>
                        <span className="text-zinc-300 dark:text-zinc-700 font-mono">-</span>
                        <input type="date" value={timelineEnd} onChange={e => setTimelineEnd(e.target.value)} className="bg-transparent font-mono p-1 outline-none text-zinc-900 dark:text-white cursor-pointer"/>
                      </div>
                    </div>

                    <div className={`flex w-full pt-4 ${timelineDays.length > 7 ? 'overflow-x-auto pb-6 snap-x scrollbar-hide' : 'pb-2'}`}>
                      {timelineDays.map((dateStr) => {
                        const dayTasks = currentTasks.filter(t => t.deadline?.startsWith(dateStr) && t.status !== 'cancelled').sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
                        const isToday = dateStr === toLocalISODate(new Date());
                        const isCompact = timelineDays.length <= 7;
                        
                        return (
                          <div key={dateStr} className={`flex flex-col relative group ${isCompact ? 'flex-1 min-w-0' : 'min-w-[160px] md:min-w-[200px] shrink-0 snap-start'}`}>
                            <div className="flex items-center w-full mb-3">
                              <div className={`w-3 h-3 rounded-full border-[3px] shrink-0 z-10 ${isToday ? 'bg-white border-zinc-900 dark:bg-black dark:border-white' : dayTasks.length > 0 ? 'bg-blue-500 border-blue-200 dark:bg-blue-400 dark:border-blue-900' : 'bg-zinc-200 border-white dark:bg-zinc-800 dark:border-black'}`}></div>
                              <div className="flex-1 h-[2px] bg-zinc-100 dark:bg-zinc-800"></div>
                            </div>
                            
                            <div className="pr-2 md:pr-4 mb-3">
                              <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-2">
                                 <span className={`font-bold font-mono text-xs md:text-sm tracking-widest ${isToday ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                   {dateStr.slice(5).replace('-', '/')}
                                 </span>
                                 {isToday && <span className="text-[9px] font-bold bg-zinc-900 text-white dark:bg-white dark:text-black px-1 py-0.5 w-max">TODAY</span>}
                              </div>
                              <div className="text-[9px] font-bold uppercase text-zinc-400 dark:text-zinc-600 mt-0.5">{getWeekday(new Date(dateStr + "T00:00:00"))}</div>
                            </div>

                            <div className="pr-2 md:pr-4 flex flex-col gap-2">
                              {dayTasks.length === 0 ? (
                                 <span className="text-[10px] font-mono text-zinc-300 dark:text-zinc-700">---</span>
                              ) : (
                                activeTrack === 'company' ? (
                                  dayTasks.map(t => {
                                    let displayText = '';
                                    if (uiPrefs.timelineCompanyDisplay === 'keyword') displayText = extractKeyword(t.title);
                                    else if (uiPrefs.timelineCompanyDisplay === 'company') displayText = t.company || '未定公司';
                                    else if (uiPrefs.timelineCompanyDisplay === 'contact') displayText = t.contact || '无对接人';
                                    else if (uiPrefs.timelineCompanyDisplay === 'location') displayText = t.locations[0] || '无地点';

                                    return (
                                      <div key={t.id} onClick={() => scrollToTask(t.id)} title={t.title} className="p-1.5 md:p-2 bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:border-zinc-500 transition-colors">
                                        <div className="text-[9px] font-mono text-zinc-500 mb-0.5 md:mb-1">{t.deadline.slice(11,16)}</div>
                                        <div className={`font-bold text-[11px] md:text-sm truncate ${t.status === 'done' ? 'text-emerald-600 dark:text-emerald-500' : t.status === 'cancelled' ? 'text-zinc-400 line-through decoration-2 decoration-zinc-400/80' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                          {displayText}
                                        </div>
                                      </div>
                                    )
                                  })
                                ) : (
                                  <div className={`flex flex-col gap-2 ${isCompact ? 'w-full' : 'w-[200px]'}`}>
                                    {uiPrefs.timelineTripShow.purposes && dayTasks.some(t => t.purposes?.length > 0) && (
                                      <div className="bg-zinc-50 dark:bg-[#111] p-1.5 md:p-2.5 border border-zinc-200 dark:border-zinc-800">
                                        <div className="text-[9px] font-bold text-zinc-500 mb-1.5 flex items-center gap-1 uppercase tracking-widest"><CheckCircle2 size={10}/> 事务</div>
                                        {dayTasks.map(t => (
                                          t.purposes?.length > 0 && (
                                            <div key={`purp-${t.id}`} className="mb-2 last:mb-0 cursor-pointer group" onClick={() => scrollToTask(t.id)}>
                                              <div className="text-[9px] font-mono text-blue-600 dark:text-blue-400 group-hover:underline">{t.deadline.slice(11,16)}</div>
                                              <div className={`text-[10px] md:text-xs font-bold leading-relaxed truncate ${t.status === 'done' ? 'text-emerald-600 dark:text-emerald-500' : t.status === 'cancelled' ? 'text-zinc-400 line-through decoration-2 decoration-zinc-400/80' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                                {t.purposes[0]}
                                              </div>
                                            </div>
                                          )
                                        ))}
                                      </div>
                                    )}
                                    
                                    {uiPrefs.timelineTripShow.transport && dayTasks.some(t => t.transportation) && (
                                      <div className="bg-blue-50/50 dark:bg-blue-950/20 p-1.5 md:p-2.5 border border-blue-100 dark:border-blue-900/50">
                                        <div className="text-[9px] font-bold text-blue-600 dark:text-blue-500 mb-1 flex items-center gap-1 uppercase tracking-widest"><Plane size={10}/> 交通</div>
                                        {dayTasks.map(t => t.transportation && (
                                          <div key={`trans-${t.id}`} className="text-[10px] md:text-xs font-bold text-blue-900 dark:text-blue-300 leading-snug truncate">
                                            {t.transportation}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {uiPrefs.timelineTripShow.accommodation && dayTasks.some(t => t.accommodation) && (
                                      <div className="bg-amber-50/50 dark:bg-amber-950/20 p-1.5 md:p-2.5 border border-amber-100 dark:border-amber-900/50">
                                        <div className="text-[9px] font-bold text-amber-600 dark:text-amber-500 mb-1 flex items-center gap-1 uppercase tracking-widest"><Bed size={10}/> 住宿</div>
                                        {dayTasks.map(t => t.accommodation && (
                                          <div key={`acc-${t.id}`} className="text-[10px] md:text-xs font-bold text-amber-900 dark:text-amber-300 leading-snug truncate">
                                            {t.accommodation}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  {/* 详细列表/表格 */}
                  <section className={`bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 min-h-[500px] ${uiPrefs.spacing}`}>
                    <div className="mb-6 border-b border-zinc-200 dark:border-zinc-900 pb-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <h3 className={`${currentFont.large} font-bold text-zinc-900 dark:text-white uppercase tracking-widest flex items-center gap-2`}>
                          <LayoutDashboard size={16} /> 
                          {activeTrack === 'company' ? '全公司任务明细' : '行程数据表'}
                        </h3>
                        
                        {activeTrack === 'company' && (
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => setSelectedCompany('all')} className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border ${selectedCompany === 'all' ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-black' : 'bg-transparent border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-white'}`}>全部公司</button>
                            {companies.map(c => (
                              <button key={c} onClick={() => setSelectedCompany(c)} className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border ${selectedCompany === c ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-black' : 'bg-transparent border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-white'}`}>{c}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {activeTrack === 'company' ? (
                      <div className="flex flex-col gap-4">
                        {filteredCompanyTasks.length === 0 ? <div className="py-16 text-center text-zinc-400 font-mono uppercase tracking-widest">No Data</div> : filteredCompanyTasks.map(t => {
                          const isCancelled = t.status === 'cancelled';
                          const isDone = t.status === 'done';
                          const isHighlighted = highlightId === t.id;
                          return (
                            <div key={t.id} id={`task-${t.id}`} className={`p-5 rounded-none border transition-all duration-500 relative overflow-hidden ${isHighlighted ? 'border-zinc-900 bg-zinc-50 dark:border-white dark:bg-[#111] z-10' : isCancelled ? 'bg-zinc-50 dark:bg-[#050505] border-zinc-200 dark:border-zinc-900 opacity-80' : isDone ? 'bg-zinc-50 dark:bg-[#0a0a0a] border-zinc-200 dark:border-zinc-900 opacity-90' : 'bg-white dark:bg-[#0a0a0a] border-zinc-300 dark:border-zinc-800'}`}>
                              <div className="flex justify-between items-start mb-3">
                                 <div className="flex flex-col">
                                    <span className="font-mono text-xs text-zinc-500 mb-1">#{t.displayId}</span>
                                    <h4 className={`font-bold ${isCancelled ? 'text-zinc-400 line-through decoration-2 decoration-zinc-400/80' : isDone ? 'text-emerald-600 dark:text-emerald-500' : 'text-zinc-900 dark:text-white'}`}>{t.title}</h4>
                                 </div>
                                 <div className="flex gap-2">
                                    <button onClick={()=>openExplorer({type:'task', value:t.title, id:t.id})} className="p-1 text-zinc-400 hover:text-blue-500"><Network size={14}/></button>
                                 </div>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs mb-4">
                                 {t.company && <button onClick={()=>openExplorer({type:'company', value:t.company})} className="border border-zinc-200 dark:border-zinc-800 px-2 py-1 hover:border-blue-500">{t.company}</button>}
                                 {t.contact && <button onClick={()=>openExplorer({type:'person', value:t.contact})} className="border border-zinc-200 dark:border-zinc-800 px-2 py-1 hover:border-blue-500 flex items-center gap-1"><User size={10}/> {t.contact}</button>}
                                 {t.locations.map(loc => <button key={loc} onClick={()=>openExplorer({type:'location', value:loc})} className="border border-zinc-200 dark:border-zinc-800 px-2 py-1 hover:border-blue-500 flex items-center gap-1"><MapPin size={10}/> {loc}</button>)}
                              </div>
                              <div className="flex justify-between items-center border-t border-zinc-100 dark:border-zinc-900 pt-3">
                                 <span className="font-bold text-zinc-500">{fmtDate(t.deadline)}</span>
                                 <div className="flex gap-2">
                                   {!isCancelled && <button onClick={()=>changeTaskStatus(t.id, isDone?'todo':'done')} className="border border-zinc-300 px-3 py-1 font-bold text-xs uppercase hover:bg-zinc-100 dark:hover:bg-zinc-800">{isDone?'撤销':'完成'}</button>}
                                   <button onClick={()=>changeTaskStatus(t.id, isCancelled?'todo':'cancelled')} className="border border-zinc-300 px-3 py-1 font-bold text-xs uppercase hover:bg-zinc-100 dark:hover:bg-zinc-800">{isCancelled?'恢复':'废止'}</button>
                                 </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-[#050505]">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 text-[10px] uppercase tracking-widest bg-zinc-100 dark:bg-black">
                              {uiPrefs.showTableCols.id && <th className="p-4 font-bold w-24">ID</th>}
                              {uiPrefs.showTableCols.time && <th className="p-4 font-bold w-32">Time</th>}
                              {uiPrefs.showTableCols.context && <th className="p-4 font-bold">Nodes</th>}
                              {uiPrefs.showTableCols.purpose && <th className="p-4 font-bold">Purposes</th>}
                              {uiPrefs.showTableCols.action && <th className="p-4 font-bold text-center w-32">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedTripTasks.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-zinc-400">No Data</td></tr>}
                            {sortedTripTasks.map(t => {
                              const isCancelled = t.status === 'cancelled';
                              const isDone = t.status === 'done';
                              const isHighlighted = highlightId === t.id;
                              return (
                                <tr key={t.id} id={`task-${t.id}`} className={`border-b border-zinc-200 dark:border-zinc-900 ${isHighlighted ? 'bg-zinc-100 dark:bg-zinc-800' : isCancelled?'opacity-80 bg-zinc-50 dark:bg-[#050505]':'hover:bg-zinc-100 dark:hover:bg-[#111]'}`}>
                                  {uiPrefs.showTableCols.id && <td className="p-4 font-mono text-[10px]">{t.displayId}</td>}
                                  {uiPrefs.showTableCols.time && <td className="p-4 font-mono text-xs">{fmtDate(t.deadline)}</td>}
                                  {uiPrefs.showTableCols.context && (
                                    <td className="p-4">
                                      <div className="flex flex-col gap-1.5 items-start">
                                        {t.meetWho && <button onClick={()=>openExplorer({type:'person', value:t.meetWho})} className="text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-black px-1.5 py-0.5 hover:border-blue-500 flex gap-1 items-center"><UserCheck size={10} className="text-zinc-500"/> {t.meetWho}</button>}
                                        {t.locations.map(l => <button key={l} onClick={()=>openExplorer({type:'location', value:l})} className="text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-black px-1.5 py-0.5 hover:border-blue-500 flex gap-1 items-center"><MapPin size={10} className="text-amber-600"/> {l}</button>)}
                                        {t.transportation && <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 flex gap-1 items-center"><Plane size={10}/> {t.transportation}</span>}
                                        {t.accommodation && <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 flex gap-1 items-center"><Bed size={10}/> {t.accommodation}</span>}
                                      </div>
                                    </td>
                                  )}
                                  {uiPrefs.showTableCols.purpose && (
                                    <td className="p-4">
                                      <div className="flex items-center gap-2 mb-1 group">
                                         <span className={`font-bold text-sm line-clamp-2 ${isCancelled ? 'text-zinc-400 line-through decoration-2 decoration-zinc-400/80' : isDone ? 'text-emerald-600 dark:text-emerald-500' : 'text-zinc-900 dark:text-zinc-100'}`}>{t.purposes?.[0]}</span>
                                         <button onClick={()=>openExplorer({type:'task', value:t.purposes?.[0], id:t.id})} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-blue-500 transition-opacity"><Network size={12}/></button>
                                      </div>
                                      {t.purposes?.length > 1 && <div className="text-[10px] text-zinc-500">+{t.purposes.length - 1} 个节点</div>}
                                      {t.note && <div className={`text-xs mt-2 leading-relaxed ${isCancelled ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500'}`}>{t.note}</div>}
                                    </td>
                                  )}
                                  {uiPrefs.showTableCols.action && (
                                    <td className="p-4 text-center">
                                      <div className="flex flex-col gap-1.5">
                                        {isCancelled ? <span className="text-[10px] border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-zinc-500">已废止</span> : isDone ? <span className="text-[10px] border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1">已完成</span> : (
                                          <div className="flex gap-1">
                                            <button onClick={()=>changeTaskStatus(t.id, 'done')} className="border border-zinc-300 hover:bg-zinc-200 flex-1 p-1"><Check size={14} className="mx-auto"/></button>
                                            <button onClick={()=>changeTaskStatus(t.id, 'cancelled')} className="border border-zinc-300 hover:bg-zinc-200 flex-1 p-1"><Ban size={14} className="mx-auto"/></button>
                                          </div>
                                        )}
                                        {isCancelled && (
                                          <button onClick={() => handleReschedule(t)} className="w-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 py-1 rounded flex items-center justify-center gap-1 transition-colors">
                                            <RefreshCw size={10}/> 重新安排
                                          </button>
                                        )}
                                        {isDone && (
                                          <button onClick={() => changeTaskStatus(t.id, 'todo')} className="w-full text-[10px] font-bold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 py-1.5 flex items-center justify-center gap-1 mt-1 transition-colors">
                                            <RefreshCw size={10}/> 撤销完成
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* 右侧录入表单 */}
            <div className="xl:col-span-5 space-y-6">
              <section ref={formRef} className={`bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-900 ${uiPrefs.spacing}`}>
                <h3 className="font-bold text-zinc-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2"><Plus size={16} /> 结构化录入</h3>
                
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="w-full sm:w-1/3">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">流水编号 (ID)</label>
                      <input name="displayId" value={formData.displayId} onChange={handleFormChange} placeholder="AUTO" className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none font-mono text-sm text-zinc-900 dark:text-white transition-colors" />
                    </div>
                    
                    {activeTrack === 'company' && (
                      <div className="w-full sm:flex-1">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">归属实体 (Entity)</label>
                        <input list="company-list" name="company" value={formData.company} onChange={handleFormChange} placeholder="选择或输入新公司..." className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm font-bold text-zinc-900 dark:text-white transition-colors" />
                        <datalist id="company-list">
                          {companies.map(c => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                    )}
                  </div>

                  {activeTrack === 'trip' && activeSubTrack === 'events' && (
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">事件类型</label>
                      <select name="eventType" value={formData.eventType} onChange={handleFormChange} className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm font-bold text-zinc-900 dark:text-white">
                        <option value="exhibition">国际/国内展会</option>
                        <option value="anniversary">重要纪念日</option>
                        <option value="birthday">家庭成员生日</option>
                      </select>
                    </div>
                  )}

                  {activeTrack === 'company' || (activeTrack === 'trip' && activeSubTrack === 'events') ? (
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">
                        {activeSubTrack === 'events' ? '内容名称 (展会/纪念日名)' : '事项标题 (Title)'} *
                      </label>
                      <input name="title" value={formData.title} onChange={handleFormChange} placeholder="输入标题..." className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none font-bold text-zinc-900 dark:text-white transition-colors" />
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 p-4">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-3">行程事由 (Purposes) *</label>
                      {formData.purposes.length > 0 && (
                        <div className="flex flex-col gap-2 mb-4">
                          {formData.purposes.map(p => (
                            <div key={p} className="flex items-start justify-between bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 pl-3 pr-2 py-2 text-sm font-bold text-zinc-900 dark:text-white">
                              <span className="flex-1 mt-0.5">{p}</span>
                              <button onClick={() => removePurpose(p)} className="text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-white ml-2 p-1"><X size={14}/></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input value={purposeInput} onChange={(e) => setPurposeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddPurpose(e); }} placeholder="输入事由 (Enter)..." className="flex-1 p-3 bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 outline-none text-sm text-zinc-900 dark:text-white transition-colors" />
                        <button onClick={handleAddPurpose} className="px-5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white text-xs font-bold uppercase transition-colors">ADD</button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 p-4">
                    <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1"><MapPin size={12} /> {activeTrack === 'trip' ? '行程地点 (Locations)' : '办公地点'}</label>
                    {formData.locations.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {formData.locations.map(loc => (
                          <span key={loc} className="inline-flex items-center gap-1 bg-zinc-50 dark:bg-[#111] border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-white">
                            {loc}
                            <button onClick={() => removeLocation(loc)} className="text-zinc-400 hover:text-red-500 dark:hover:text-white ml-1"><X size={12}/></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input value={locInput} onChange={(e) => setLocInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddLocation(e); }} placeholder="输入地点 (Enter)..." className="flex-1 p-3 bg-zinc-50 dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 outline-none text-sm text-zinc-900 dark:text-white transition-colors" />
                      <button onClick={handleAddLocation} className="px-5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white text-xs font-bold uppercase transition-colors">ADD</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {activeTrack === 'trip' && activeSubTrack === 'itinerary' && (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Plane size={12} />交通 (Flight/Train)</label>
                          <input name="transportation" value={formData.transportation} onChange={handleFormChange} placeholder="例如: MU5101" className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm text-zinc-900 dark:text-white transition-colors" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Bed size={12} />住宿 (Hotel)</label>
                          <input name="accommodation" value={formData.accommodation} onChange={handleFormChange} placeholder="例如: 香格里拉" className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm text-zinc-900 dark:text-white transition-colors" />
                        </div>
                      </>
                    )}
                    
                    {activeSubTrack !== 'events' && (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                            {activeTrack === 'trip' ? <><UserCheck size={12} />会见对象</> : <><User size={12} />对接人员</>}
                          </label>
                          <input name={activeTrack === 'trip' ? "meetWho" : "contact"} value={activeTrack === 'trip' ? formData.meetWho : formData.contact} onChange={handleFormChange} placeholder="..." className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm text-zinc-900 dark:text-white transition-colors" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">优先级</label>
                          <select name="priority" value={formData.priority} onChange={handleFormChange} className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm font-bold text-zinc-900 dark:text-white transition-colors">
                            <option value="高">高 (High)</option>
                            <option value="中">中 (Medium)</option>
                            <option value="低">低 (Low)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">日期/时间 *</label>
                    <input name="deadline" type={activeTrack === 'trip' && activeSubTrack === 'events' ? "date" : "datetime-local"} value={formData.deadline} onChange={handleFormChange} className="w-full p-3 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none text-sm font-mono font-bold text-zinc-900 dark:text-white transition-colors" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">备注细节 (Notes)</label>
                    <textarea name="note" value={formData.note} onChange={handleFormChange} placeholder="..." className="w-full p-4 bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 outline-none min-h-[100px] resize-y text-sm text-zinc-900 dark:text-white transition-colors" />
                  </div>

                  <button onClick={handleAddTask} className="w-full py-4 mt-2 bg-zinc-900 text-white dark:bg-white dark:text-black font-black uppercase tracking-widest hover:bg-black dark:hover:bg-zinc-200 transition-colors flex justify-center items-center gap-2 text-sm">
                    <Save size={16} /> 保存入库 (Save)
                  </button>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
