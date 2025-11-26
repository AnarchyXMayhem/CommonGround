import React, { useState, useEffect, useRef, useMemo, useReducer, useContext, useCallback, memo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, deleteDoc, collection, onSnapshot, serverTimestamp, query, orderBy, limit, updateDoc, getDoc, where } from 'firebase/firestore';
import { Loader2, Trash2, Book, MessageCircle, Calendar as CalendarIcon, Send, Sparkles, Image as ImageIcon, User, Shuffle, CheckCircle, Flame, Lock, Plus, X, Compass, LayoutGrid, Zap, ArrowRight, Home, Heart, BrainCircuit, Mic, MicOff, Clapperboard, Film, Music, Tv, Share2, Upload, PenTool, Gift, Link, Copy, Check, Camera, Palette, Download, Lightbulb, Star, Video, Settings, LogOut, RefreshCw, Play } from 'lucide-react';

// --- CONFIGURATION ---
const APP_NAME = "Common Ground";
const GEMINI_API_KEY = "AIzaSyA_fQ5WA1FoIF81zY37G7Ndrwr2mRYitHU";
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent`;
// NOTE: Image generation logic is active using Imagen 3.0
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generate`;

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// IMPORTANT: You must replace this object with your actual Firebase Config from the console
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// FIX: Corrected circular reference
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

// === PERSISTENT STORAGE HELPERS ===
const STORAGE_VERSION = "v1";
const STORAGE_PREFIX = `cg_beta_${STORAGE_VERSION}`;

const betaStorage = {
    saveSession(pairId, data) {
        try {
            localStorage.setItem(`${STORAGE_PREFIX}_session_${pairId}`, JSON.stringify(data));
            console.log('✅ Beta session saved:', pairId);
        } catch (e) {
            console.error('❌ Failed to save session:', e);
        }
    },
    loadSession(pairId) {
        try {
            if (pairId === 'latest') return null;
            const result = localStorage.getItem(`${STORAGE_PREFIX}_session_${pairId}`);
            if (result) {
                return JSON.parse(result);
            }
        } catch (e) {
            console.error('❌ Failed to load session:', e);
        }
        return null;
    },
    deleteSession(pairId) {
        try {
            localStorage.removeItem(`${STORAGE_PREFIX}_session_${pairId}`);
        } catch (e) {
            console.error('❌ Failed to delete session:', e);
        }
    }
};

// --- CONSTANTS & MOCK DATA ---
const IMAGES = { owl: "https://placehold.co/400x400/FFD700/FFF?text=Owl" };
const MODULES = [
    { id: 'closer', title: 'Feel Closer', icon: Sparkles, desc: 'Deepen connection daily.', stats: { days: 7 }, outcomes: ['Rekindle feelings', 'Notice attraction'], prompt: "Soft watercolor anime style, two boys sitting side by side on a grassy hill under a starry sky, peaceful, wholesome" },
    { id: 'conflict', title: 'Healthy Conflict', icon: Heart, desc: 'Argue better, together.', stats: { days: 7 }, outcomes: ['Stop spiraling', 'Feel heard'], prompt: "Soft watercolor anime style, two boys holding hands and looking at each other understandingly, gentle smile, reconciliation" },
    { id: 'convos', title: 'Clear Chats', icon: MessageCircle, desc: 'Fix communication.', stats: { days: 7 }, outcomes: ['Fewer assumptions', 'Smoother talks'], prompt: "Soft watercolor anime style, two boys drinking coffee at a cafe table and chatting happily, laughing" }
];
const QUESTIONS = [ { id: 'food', text: "Comfort food?", key: 'food', icon: '🥘' }, { id: 'song', text: "Mood song?", key: 'song', icon: '🎵' } ];
const SPARKS = ["What is one small thing I did this week that made you feel loved?", "If we could teleport anywhere right now, where?"];
const DEFAULT_PLAYLIST = [{ id: 's1', title: "Die For You", artist: "The Weeknd", cover: "https://placehold.co/100x100/333/FFF?text=S" },
    { id: 's2', title: "Pink + White", artist: "Frank Ocean", cover: "https://placehold.co/100x100/pink/FFF?text=Blonde" },
];
const DEFAULT_WATCHING = { anime: [], shows: [] };

// --- HELPERS ---
function Handshake(props) { return <Heart {...props} /> } 
function MessageSquare(props) { return <MessageCircle {...props} /> }
function extractJSON(text) {
    try {
        const firstCurly = text.indexOf('{');
        const lastCurly = text.lastIndexOf('}');
        if (firstCurly !== -1 && lastCurly !== -1) return JSON.parse(text.substring(firstCurly, lastCurly + 1));
        return JSON.parse(text); 
    } catch (e) { return null; }
}
function downloadImage(base64Data, filename = 'cg_image.png') {
    try {
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) { console.error("Download failed", e); }
}
// Helper for Avatar Studio Upload
const fileToB64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.onload = (e) => resolve(e.target.result); r.readAsDataURL(file); });


// --- STATE ---
const initialState = {
    isReady: false,
    onboardingStep: 'loading',
    tab: 'today',
    subView: { us: 'growth', me: 'profile', listMode: 'shopping' },
    data: { messages: [], events: [], journal: [], shopping: [], wishlist: [], intimacy: [], growth: [], art: {}, profiles: {}, answeredSparks: [], couplePortraits: [] },
    inputs: { chat: '', journal: '', name: '', qAnswer: '', list: '', intimacy: '', eventTitle: '', eventTime: '', songTitle: '', songArtist: '', imgUrl: '', sparkResponse: '', noteTopic: '', pairingCode: '', mediaTitle: '', mediaEp: '', appearance: '', email: '', password: '' },
    ui: { 
        user: null, realUid: null, auth: false, analyzing: false, loading: {}, 
        modal: null, activeMod: null, deeplyLock: true, appMode: 'common', 
        sparkIdx: 0, dailySpark: null, eventSuggestions: null, igniteSuggestion: null, 
        generatedNote: null, moduleExercise: null, cal: new Date(), calSel: new Date(), 
        showVentIntro: true, ventAnalysis: null, mediaTab: 'anime', pairingData: null,
        tempAvatar: null, linkError: null, linkSuccess: null 
    },
    uploadFile: null,
    pairId: null,
};

function appReducer(state, action) {
    switch (action.type) {
        case 'SET_READY': return { ...state, isReady: true };
        case 'SET_USER_AUTH': return { ...state, ui: { ...state.ui, realUid: action.payload.uid, auth: true } };
        case 'SET_ROLE': return { ...state, ui: { ...state.ui, user: action.payload } };
        case 'SET_PAIR': return { ...state, pairId: action.payload.pairId, partnerName: action.payload.partnerName, onboardingStep: 'done' };
        case 'SET_ONBOARDING_STEP': return { ...state, onboardingStep: action.payload };
        case 'SET_TAB': return { ...state, tab: action.payload };
        case 'SET_SUBVIEW': return { ...state, subView: { ...state.subView, ...action.payload } };
        case 'SET_UI_STATE': return { ...state, ui: { ...state.ui, ...action.payload } };
        case 'SET_LOADING': return { ...state, ui: { ...state.ui, loading: { ...state.ui.loading, [action.payload.key]: action.payload.value } } };
        case 'SET_INPUT': return { ...state, inputs: { ...state.inputs, [action.payload.key]: action.payload.value } };
        case 'RESET_INPUTS': return { ...state, inputs: { ...state.inputs, ...Object.fromEntries(action.payload.map(key => [key, ''])) }};
        case 'SET_DATA': return { ...state, data: { ...state.data, [action.payload.key]: action.payload.value } };
        case 'SET_UPLOAD_FILE': return { ...state, uploadFile: action.payload };
        case 'HYDRATE': return { ...state, ...action.payload, isReady: true };
        default: return state;
    }
}

const AppContext = React.createContext();

// --- PROVIDER ---
const AppProvider = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    const app = useMemo(() => initializeApp(firebaseConfig), []);
    const db = useMemo(() => getFirestore(app), [app]);
    const auth = useMemo(() => getAuth(app), [app]);

    // 1. Auth & Restoration
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                dispatch({ type: 'SET_USER_AUTH', payload: { uid: user.uid } });
                dispatch({ type: 'SET_READY' });
                
                try {
                    const savedRole = localStorage.getItem('user_role');
                    const savedPair = localStorage.getItem('pair_id');

                    if (savedRole && savedPair) {
                        const sessionData = betaStorage.loadSession(savedPair);
                        if (sessionData) {
                            dispatch({ type: 'HYDRATE', payload: sessionData });
                        } else {
                            dispatch({ type: 'SET_ROLE', payload: savedRole });
                            dispatch({ type: 'SET_PAIR', payload: { pairId: savedPair } });
                        }
                    } else {
                        dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'welcome' });
                    }
                } catch(e) {
                    console.warn("Restoration error", e);
                    dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'welcome' });
                }
            } else {
                if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                else await signInAnonymously(auth);
            }
        });
        return () => unsub();
    }, [auth]);

    // 2. Data Listeners
    useEffect(() => {
        if (!db || !state.ui.auth) return;
        const base = `artifacts/${appId}/public/data`;
        
        const colConfigs = [
            { key: 'events', path: `${base}/calendar_events`, limit: 50 },
            { key: 'journal', path: `${base}/journal_entries`, limit: 20 },
            { key: 'shopping', path: `${base}/shopping_list`, limit: 50 },
            { key: 'wishlist', path: `${base}/wishlist_items`, limit: 50 },
            { key: 'intimacy', path: `${base}/intimacy_items`, limit: 20 },
            { key: 'growth', path: `${base}/growth_progress`, limit: 20 },
            { key: 'answeredSparks', path: `${base}/answered_sparks`, limit: 20 },
            { key: 'couplePortraits', path: `${base}/couple_portraits`, limit: 10 }
        ];

        const unsubs = colConfigs.map(({ key, path, limit: l }) => {
            let q = collection(db, path);
            if (l) q = query(collection(db, path), limit(l));
            
            return onSnapshot(q, (snap) => {
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                dispatch({ type: 'SET_DATA', payload: { key, value: items } });
            }, (e) => console.warn(`Sync error ${key}`, e));
        });

        unsubs.push(onSnapshot(doc(db, `${base}/argument_chats`, 'main_chat'), (doc) => {
            if (doc.exists()) dispatch({ type: 'SET_DATA', payload: { key: 'messages', value: doc.data().messages || [] } });
        }, (e) => console.warn("Chat Sync Error", e)));

        unsubs.push(onSnapshot(collection(db, `${base}/profiles`), (snap) => {
            const map = {}; snap.forEach(d => { map[d.id] = d.data(); });
            dispatch({ type: 'SET_DATA', payload: { key: 'profiles', value: map } });
        }, (e) => console.warn("Profile Sync Error", e)));

        unsubs.push(onSnapshot(collection(db, `${base}/module_art`), (snap) => {
            const map = {}; snap.forEach(d => { map[d.id] = d.data().base64; });
            dispatch({ type: 'SET_DATA', payload: { key: 'art', value: map } });
        }, (e) => console.warn("Art Sync Error", e)));

        return () => unsubs.forEach(u => u && u());
    }, [db, state.ui.auth]);

    // 3. Actions
    const simpleAdd = useCallback(async (collectionKey, payload, inputKey) => {
        if (!db) return;
        const finalPayload = { ...payload, pairId: state.pairId || 'solo', createdAt: serverTimestamp() };
        await addDoc(collection(db, `artifacts/${appId}/public/data/${collectionKey}`), finalPayload);
        if (inputKey) dispatch({ type: 'RESET_INPUTS', payload: [inputKey] });
    }, [db, state.pairId]);

    const updateProfile = useCallback(async (key, val) => {
        if (!db || !state.ui.user) return;
        await setDoc(doc(db, `artifacts/${appId}/public/data/profiles`, state.ui.user), { [key]: val }, {merge: true});
    }, [db, state.ui.user]);

    const deleteDocCb = useCallback(async (path) => { if (db) await deleteDoc(doc(db, `artifacts/${appId}/public/data/${path}`)); }, [db]);
    const updateDocCb = useCallback(async (path, data) => { if (db) await updateDoc(doc(db, `artifacts/${appId}/public/data/${path}`), data); }, [db]);

    const sendMsg = useCallback(async (txt, mediaBase64, mediaType, draftAudio) => {
        if (!db) return;
        let finalMedia = mediaBase64;
        let finalType = mediaType || 'text';
        if (draftAudio) {
            finalType = 'audio';
            finalMedia = await new Promise((r) => { const rr = new FileReader(); rr.onloadend = () => r(rr.result); rr.readAsDataURL(draftAudio); });
        }
        await setDoc(doc(db, `artifacts/${appId}/public/data/argument_chats/main_chat`), {
            messages: [...state.data.messages, { id: crypto.randomUUID(), sender: state.ui.user, text: txt || '', type: finalType, media: finalMedia || null, timestamp: Date.now() }], appId
        }, { merge: true });
    }, [db, state.data.messages, state.ui.user]);

    const handleShare = useCallback(async (data) => {
        if (navigator.share) await navigator.share({ title: APP_NAME, text: data.text || '' });
    }, []);

    // --- CLAUDE TEXT HANDLER (Via Gemini) ---
    const handleClaudeText = useCallback(async (task, context, fileBase64 = null) => {
        let prompt = '';
        let messages = [];

        if (task === 'generate_spark') {
            prompt = "Act as a relationship coach. Generate one unique, thoughtful 'Daily Spark' conversation starter for a couple. Make it personal and engaging. Return just the question, no extra formatting.";
        }
        else if (task === 'intimacy_advice') {
            prompt = `Act as a sex-positive relationship coach. Provide a spicy, 18+ suggestion for: ${context}. Be playful and specific.`;
        }
        else if (task === 'analyze_avatar_photo') {
            prompt = "Analyze this face and describe it in detail for an anime character prompt. Include hair color, style, eye color, facial features, and expression. Be concise but vivid.";
        }
        else if (task === 'vent_analysis') {
            prompt = `Analyze this relationship confession: "${context}". Provide response as JSON with these keys: "tone", "actionable", "cheeky". Return ONLY the JSON object, no markdown formatting.`;
        }
        else if (task === 'draft_reply') {
            const recentMessages = state.data.messages.slice(-5).map(m => m.text).join('\n');
            prompt = `Based on this recent conversation:\n${recentMessages}\n\nSuggest a short, warm, authentic reply. Keep it under 50 words.`;
        }
        else if (task === 'write_note') {
            prompt = `Write a sweet, romantic note about: ${context}. Keep it heartfelt and personal, 2-3 sentences max.`;
        }
        else if (task === 'generate_astrology') {
            prompt = `Generate a mystical astrology profile for someone born: ${context}. Return as JSON with these keys: "sun", "moon", "rising", "summary". Return ONLY the JSON object, no markdown.`;
        }
        else if (task === 'get_ingredients') {
            prompt = `List 5-7 ingredients needed to make: ${context}. Return each ingredient on a new line.`;
        }
        else if (task === 'gift_ideas') {
            prompt = `Suggest 5 thoughtful gift ideas related to: ${context}. Return each idea on a new line.`;
        }
        else if (task === 'analyze_chat') {
            prompt = `As a relationship counselor, analyze this conversation and give helpful advice: ${context}. Keep it supportive and actionable.`;
        }
        else if (task === 'generate_exercise') {
            prompt = `Create a daily relationship exercise for the module: ${context}. Make it specific, actionable, and doable in 10-15 minutes.`;
        }
        else if (task === 'plan_date') {
            prompt = `Suggest a creative date idea. Be specific about activities, timing, and what makes it special. 2-3 sentences.`;
        } else {
            prompt = `Task: ${task} Context: ${context}`;
        }

        let payload = { contents: [{ parts: [{ text: prompt }] }] };
        if (task === 'analyze_avatar_photo' && fileBase64) {
            payload = { contents: [{ parts: [{ text: "Analyze this face for an anime prompt." }, { inlineData: { mimeType: "image/jpeg", data: fileBase64.split(',')[1] } } ] }] };
        }

        const res = await fetch(`${TEXT_API_URL}?key=${GEMINI_API_KEY}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
        });
        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }, [state.data.messages]);

    const handleAI = useCallback(async (task, context, fileBase64 = null) => {
        const loadingKey = task.includes('spark') ? 'spark' : task.includes('ignite') ? 'ignite' : task.includes('avatar') ? 'avatar' : 'global';
        dispatch({ type: 'SET_LOADING', payload: { key: loadingKey, value: true } });
        try {
            const isImageGen = task === 'generate_avatar_final' || task === 'generate_couple_art' || task.includes('art');
            
            if (isImageGen) {
                // Image Generation via Gemini Imagen
                let prompt = '';
                if (task === 'generate_avatar_final') prompt = `High quality anime portrait, makoto shinkai style. Description: ${context}`;
                else if (task === 'generate_couple_art') {
                    const p1 = state.data.profiles['user1']?.appearance || 'Person';
                    const p2 = state.data.profiles['user2']?.appearance || 'Partner';
                    prompt = `Anime style couple portrait. ${p1} and ${p2}. Romantic, soft lighting, highly detailed.`;
                } else if (task === 'art') prompt = `High quality anime style art. Description: ${context}`;

                const url = `${IMAGE_API_URL}?key=${GEMINI_API_KEY}`;
                const payload = { prompt, number_of_images: 1, aspect_ratio: "1:1" };
                
                const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
                const json = await res.json();

                if (json.error) throw new Error(json.error.message);
                
                const b64 = json.predictions?.[0]?.bytesBase64Encoded;
                if (b64) {
                    const imgUrl = `data:image/png;base64,${b64}`;
                    if (task === 'generate_couple_art') await addDoc(collection(db, `artifacts/${appId}/public/data/couple_portraits`), { url: imgUrl, createdAt: serverTimestamp() });
                    else if (task === 'generate_avatar_final') dispatch({ type: 'SET_UI_STATE', payload: { tempAvatar: imgUrl } });
                    else if(state.ui.activeMod) await setDoc(doc(db, `artifacts/${appId}/public/data/module_art`, state.ui.activeMod.id), { base64: imgUrl });
                }
            } else {
                // Text Generation via Helper
                const text = await handleClaudeText(task, context, fileBase64);
                if (!text) throw new Error("No response from AI");

                if (task === 'analyze_avatar_photo') return text;
                if (task === 'generate_spark') dispatch({ type: 'SET_UI_STATE', payload: { dailySpark: text.trim() } });
                else if (task === 'intimacy_advice') dispatch({ type: 'SET_UI_STATE', payload: { igniteSuggestion: text.trim() } });
                else if (task === 'draft_reply') dispatch({ type: 'SET_INPUT', payload: { key: 'chat', value: text.trim() } });
                else if (task === 'write_note') { dispatch({ type: 'SET_UI_STATE', payload: { generatedNote: text.trim() } }); dispatch({ type: 'RESET_INPUTS', payload: ['noteTopic'] }); }
                else if (task === 'get_ingredients' || task === 'gift_ideas') {
                    const items = text.split('\n').filter(Boolean);
                    const col = task === 'gift_ideas' ? 'wishlist_items' : 'shopping_list';
                    items.forEach(i => simpleAdd(col, { text: i.trim(), addedBy: state.ui.user, checked: false }));
                    dispatch({ type: 'RESET_INPUTS', payload: ['list'] });
                }
                else if (task === 'generate_astrology') {
                    const analysis = extractJSON(text);
                    if(analysis) await updateDoc(doc(db, `artifacts/${appId}/public/data/profiles`, state.ui.user), { astrology: analysis }, {merge: true});
                }
                else if (task === 'analyze_chat') sendMsg(`🤖 **Advice**\n\n${text}`);
                else if (task === 'vent_analysis') {
                    const analysis = extractJSON(text);
                    if(analysis) dispatch({ type: 'SET_UI_STATE', payload: { ventAnalysis: analysis }});
                }
                else if (task === 'generate_exercise') dispatch({ type: 'SET_UI_STATE', payload: { moduleExercise: text }});
                else if (task === 'plan_date') dispatch({ type: 'SET_UI_STATE', payload: { eventSuggestions: text }});
            }
        } catch(e) { console.error("AI Error", e); alert("AI Error: " + e.message); }
        finally { dispatch({ type: 'SET_LOADING', payload: { key: loadingKey, value: false } }); }
    }, [db, state.data.profiles, state.ui.user, state.data.messages, sendMsg, simpleAdd, state.ui.activeMod, handleClaudeText]);

    const linkAccount = useCallback(async (email, password) => {
        if (!auth.currentUser) return;
        dispatch({ type: 'SET_LOADING', payload: { key: 'settings', value: true } });
        try {
            const credential = EmailAuthProvider.credential(email, password);
            await linkWithCredential(auth.currentUser, credential);
            dispatch({ type: 'SET_UI_STATE', payload: { linkSuccess: 'Account linked successfully!' } });
        } catch (e) { dispatch({ type: 'SET_UI_STATE', payload: { linkError: e.message } }); } 
        finally { dispatch({ type: 'SET_LOADING', payload: { key: 'settings', value: false } }); }
    }, [auth]);

    // Auto-save State
    useEffect(() => {
        if (state.onboardingStep === 'done' && state.pairId) {
             const saveState = { pairId: state.pairId, ui: { ...state.ui, loading: {}, modal: null }, onboardingStep: state.onboardingStep };
             betaStorage.saveSession(state.pairId, saveState);
        }
    }, [state.ui, state.pairId, state.onboardingStep]);


    const value = { state, dispatch, db, auth, simpleAdd, updateProfile, deleteDoc: deleteDocCb, updateDoc: updateDocCb, sendMsg, handleShare, handleAI, linkAccount, downloadImage };
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- UI COMPONENTS ---
const Card = ({ children, className = "", title, icon: Icon, action, gradient }) => (
    <div className={`rounded-[24px] p-5 shadow-xl border border-white/5 relative overflow-hidden ${className} ${gradient ? '' : 'bg-[#2d1b4e]/60 backdrop-blur-md'}`} style={gradient ? { background: gradient } : {}}>{(title || Icon) && (<div className="flex justify-between items-center mb-4 relative z-10"><div className="flex items-center gap-3">{Icon && <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"><Icon className="w-4 h-4"/></div>}{title && <h3 className="font-graffiti text-lg text-white tracking-wider">{title}</h3>}</div>{action}</div>)}<div className="relative z-10">{children}</div></div>
);
const ConfessionalCard = ({ analysis, onShare }) => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mt-4 relative">
        <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2 text-orange-400 font-bold uppercase tracking-wider text-xs">
                <Clapperboard className="w-4 h-4" /> Producer's Notes
            </div>
            {onShare && (
                <button onClick={onShare} className="text-purple-400 hover:text-white p-1">
                    <Share2 className="w-4 h-4"/>
                </button>
            )}
        </div>
        <div className="space-y-3 text-sm">
            <div><span className="text-purple-300 font-bold block mb-1">Scene Vibe</span><p className="text-purple-100 leading-relaxed">{analysis.tone}</p></div>
            <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <span className="text-emerald-400 font-bold block mb-1 flex items-center gap-2"><Lightbulb className="w-3 h-3"/> Director's Note</span>
                <p className="text-emerald-100 leading-relaxed">{analysis.actionable}</p>
            </div>
            <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                <span className="text-rose-400 font-bold block mb-1 flex items-center gap-2"><Flame className="w-3 h-3"/> Hot Take</span>
                <p className="text-rose-100 leading-relaxed italic">"{analysis.cheeky}"</p>
            </div>
        </div>
    </div>
);
const MemoizedToggle = memo(({ options, active, onChange }) => (
    <div className="flex p-1 rounded-2xl border border-purple-800/50 bg-[#2d1b4e]/50 mb-6 overflow-x-auto hide-scroll">{options.map(o => (<button key={o.id} onClick={() => onChange(o.id)} className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-sm font-handy font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${active === o.id ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-lg' : 'text-purple-300 hover:bg-purple-800/30'}`}>{o.icon && <o.icon className="w-3 h-3"/>} {o.label}</button>))}</div>
));

const MemoizedTabButton = memo(({ active, id, label, icon: Icon, onClick }) => (
    <button onClick={() => onClick(id)} className={`flex flex-col items-center justify-center w-full h-full transition-all active:scale-95 ${active===id ? 'text-orange-400 scale-110' : 'text-purple-300/50 hover:text-purple-200'}`}>
        <Icon className="w-6 h-6 mb-1" strokeWidth={active===id?2.5:2} />
        <span className="text-[10px] font-handy font-bold">{label}</span>
    </button>
));

const MemoizedMessage = memo(({ m, isMe, isAI, handleShare }) => (
    <div className={`flex flex-col ${isMe?'items-end':isAI?'items-center':'items-start'}`}>
        <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm group relative ${isMe?'bg-gradient-to-br from-orange-500 to-rose-600 text-white rounded-br-none':isAI?'bg-[#2d1b4e] text-purple-100 border border-purple-500/30 text-left w-full p-5':'bg-[#2d1b4e] text-purple-50 rounded-bl-none'}`}>
            {m.type === 'image' && <img src={m.media} className="rounded-lg max-h-60 mb-2"/>}
            {m.type === 'video' && <video controls src={m.media} className="rounded-lg max-h-60 mb-2 w-full"></video>}
            {m.type === 'audio' && (<div className="mb-2 flex items-center gap-2 bg-black/20 p-2 rounded-lg"><div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><Mic className="w-4 h-4"/></div><audio controls src={m.media} className="h-8 w-48 opacity-80"/></div>)}
            <div className="whitespace-pre-wrap">{m.text}</div>
            {!isAI && <button onClick={()=>handleShare({text: m.text, mediaBase64: m.media, mediaType: m.type || 'text' })} className={`absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-[#2d1b4e] border border-white/10 text-purple-400 hover:text-white ${isMe ? '-left-8 right-auto' : '-right-8'}`}><Share2 className="w-3 h-3"/></button>}
        </div>
        {!isAI && <span className="text-[10px] text-purple-400/60 mt-1 mr-1">{new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
    </div>
));

// --- ONBOARDING & PAIRING ---
const OnboardingScreen = () => {
    const { state, dispatch, db, handleAI, updateProfile } = useContext(AppContext);
    const { onboardingStep, ui, inputs } = state;
    const { realUid } = ui;
    const [name, setName] = useState('');
    const [avatarMode, setAvatarMode] = useState(null);
    const [avatarPrompt, setAvatarPrompt] = useState('');
    const [astroData, setAstroData] = useState({ date: '', time: '', place: '' });
    const [code, setCode] = useState('');
    const [err, setErr] = useState('');

    const fileToB64 = (file) => new Promise((resolve) => { const r = new FileReader(); r.onload = (e) => resolve(e.target.result); r.readAsDataURL(file); });

    const handleNameSubmit = () => {
        if(!name.trim()) return;
        localStorage.setItem('temp_name', name); 
        dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'avatar' });
    };

    const handleAvatarGenerate = async () => {
        let finalPrompt = avatarPrompt;
        if (avatarMode === 'upload' || avatarMode === 'hybrid') {
            const fileInput = document.getElementById('avatar-upload');
            if (fileInput?.files?.[0]) {
                const b64 = await fileToB64(fileInput.files[0]);
                const description = await handleAI('analyze_avatar_photo', null, b64);
                if (description) finalPrompt = avatarMode === 'hybrid' ? `${avatarPrompt}. Based on features: ${description}` : description;
            }
        }
        if (finalPrompt) await handleAI('generate_avatar_final', finalPrompt);
    };

    const saveAvatar = () => {
        if (ui.tempAvatar) {
            localStorage.setItem('temp_avatar', ui.tempAvatar);
            localStorage.setItem('temp_appearance', avatarPrompt);
        }
        dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'astrology' });
    };

    const handleAstroSubmit = async () => {
        const context = `${astroData.date} at ${astroData.time} in ${astroData.place}`;
        localStorage.setItem('temp_astro_context', context);
        dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'pairing' });
    };

    const finalizeUser = async (role, pairId) => {
        localStorage.setItem('user_role', role);
        localStorage.setItem('pair_id', pairId);
        const name = localStorage.getItem('temp_name');
        const avatar = localStorage.getItem('temp_avatar');
        const appearance = localStorage.getItem('temp_appearance');
        const astroContext = localStorage.getItem('temp_astro_context');
        const profileData = { name, appearance };
        if (avatar) profileData.avatar = avatar;
        await setDoc(doc(db, `artifacts/${appId}/public/data/profiles`, role), profileData, { merge: true });
        if (astroContext) setTimeout(() => handleAI('generate_astrology', astroContext), 1000);
        dispatch({ type: 'SET_ROLE', payload: role });
        dispatch({ type: 'SET_PAIR', payload: { pairId } });
    };

    const handleSolo = async () => {
        const code = 'solo-mode';
        await setDoc(doc(db, `artifacts/${appId}/public/data/pairs`, code), { code, user1: ui.realUid, status: 'active' });
        await finalizeUser('user1_solo', code);
    };
    const handleHost = async () => {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        await setDoc(doc(db, `artifacts/${appId}/public/data/pairs`, code), { code, user1: ui.realUid, status: 'pending' });
        dispatch({ type: 'SET_UI_STATE', payload: { pairingData: { code } } });
        finalizeUser('user1', code); 
    };
    const handleJoin = async () => {
        if(code.length !== 6) return setErr('Invalid Code');
        const ref = doc(db, `artifacts/${appId}/public/data/pairs`, code.toUpperCase());
        const snap = await getDoc(ref);
        if(snap.exists()) {
            await updateDoc(ref, { user2: ui.realUid, status: 'active' });
            finalizeUser('user2', code.toUpperCase());
        } else { setErr('Code not found'); }
    };

    if (onboardingStep === 'loading') return <div className="h-screen bg-[#0f0518] flex items-center justify-center text-white">Loading...</div>;

    if (onboardingStep === 'welcome') return (
        <div className="h-screen bg-[#0f0518] flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-5xl font-graffiti text-white mb-4">Common<br/>Ground</h1>
            <button onClick={()=>dispatch({type: 'SET_ONBOARDING_STEP', payload: 'profile'})} className="bg-white text-black px-8 py-3 rounded-full font-bold">Get Started</button>
        </div>
    );

    if (onboardingStep === 'profile') return (
        <div className="h-screen bg-[#0f0518] flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-3xl text-white mb-8">What's your name?</h2>
            <input value={name} onChange={e=>setName(e.target.value)} className="w-full max-w-xs bg-white/10 p-4 rounded-xl text-white text-center mb-4" placeholder="Name"/>
            <button onClick={handleNameSubmit} disabled={!name} className="bg-orange-500 px-8 py-3 rounded-full font-bold text-white disabled:opacity-50">Next</button>
        </div>
    );

    if (onboardingStep === 'avatar') return (
        <div className="h-screen bg-[#0f0518] flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
            <h2 className="text-3xl text-white mb-4">Create Avatar</h2>
            {!avatarMode ? (
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                    <button onClick={()=>setAvatarMode('text')} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10 hover:bg-white/10"><PenTool className="mx-auto mb-2 text-purple-400"/>Describe</button>
                    <button onClick={()=>setAvatarMode('upload')} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10 hover:bg-white/10"><Camera className="mx-auto mb-2 text-orange-400"/>From Pic</button>
                    <button onClick={()=>setAvatarMode('hybrid')} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10 hover:bg-white/10"><Sparkles className="mx-auto mb-2 text-yellow-400"/>Hybrid</button>
                    <button onClick={saveAvatar} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10 hover:bg-white/10 text-white/50">Skip</button>
                </div>
            ) : (
                <div className="w-full max-w-md space-y-4">
                     {ui.tempAvatar && <img src={ui.tempAvatar} className="w-32 h-32 rounded-full mx-auto border-4 border-orange-500 shadow-lg object-cover mb-4"/>}
                     {(avatarMode === 'text' || avatarMode === 'hybrid') && (<input value={avatarPrompt} onChange={e=>setAvatarPrompt(e.target.value)} placeholder="Describe yourself..." className="w-full bg-white/10 p-3 rounded-xl text-white"/>)}
                     {(avatarMode === 'upload' || avatarMode === 'hybrid') && (<div className="bg-white/5 p-4 rounded-xl border border-dashed border-white/20"><label className="flex items-center justify-center gap-2 cursor-pointer text-white"><Upload className="w-5 h-5"/> Upload Selfie<input id="avatar-upload" type="file" accept="image/*" className="hidden" /></label></div>)}
                     <div className="flex gap-2">
                         <button onClick={()=>setAvatarMode(null)} className="flex-1 py-3 bg-white/10 rounded-xl text-white">Back</button>
                         <button onClick={handleAvatarGenerate} disabled={ui.loading.avatar} className="flex-1 py-3 bg-purple-600 rounded-xl font-bold flex items-center justify-center gap-2 text-white">{ui.loading.avatar ? <Loader2 className="animate-spin"/> : <Zap/>} Generate</button>
                     </div>
                     {ui.tempAvatar && (
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => downloadImage(ui.tempAvatar)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold text-white flex items-center justify-center gap-2"><Download className="w-4 h-4"/> Save</button>
                            <button onClick={saveAvatar} className="flex-1 py-3 bg-orange-500 rounded-xl font-bold text-white">Use Avatar</button>
                        </div>
                     )}
                </div>
            )}
        </div>
    );

    if (onboardingStep === 'astrology') return (
        <div className="h-screen bg-[#0f0518] flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-3xl text-white mb-2 font-graffiti">Cosmic Profile</h2>
            <div className="w-full max-w-xs space-y-3">
                <input type="date" value={astroData.date} onChange={e=>setAstroData({...astroData, date:e.target.value})} className="w-full bg-white/10 p-3 rounded-xl text-white"/>
                <input type="time" value={astroData.time} onChange={e=>setAstroData({...astroData, time:e.target.value})} className="w-full bg-white/10 p-3 rounded-xl text-white"/>
                <input placeholder="Birth City" value={astroData.place} onChange={e=>setAstroData({...astroData, place:e.target.value})} className="w-full bg-white/10 p-3 rounded-xl text-white"/>
                <button onClick={handleAstroSubmit} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl font-bold text-white shadow-lg mt-4">Complete Profile</button>
                <button onClick={()=>dispatch({ type: 'SET_ONBOARDING_STEP', payload: 'pairing' })} className="text-xs text-white/40 mt-2">Skip Astrology</button>
            </div>
        </div>
    );

    if (onboardingStep === 'pairing') return (
        <div className="h-screen bg-[#0f0518] flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-3xl text-white mb-8">Connect</h2>
            {ui.user === 'user1' && ui.pairingData ? (
                <div className="w-full max-w-xs bg-[#2d1b4e] p-6 rounded-3xl border border-white/10">
                    <div className="text-purple-400 text-xs font-bold uppercase mb-4">Pairing Code</div>
                    <div className="text-4xl font-mono font-bold text-white mb-6">{ui.pairingData.code}</div>
                    <button onClick={handleSolo} className="mt-4 text-xs underline text-orange-400">Skip & Go Solo</button>
                </div>
            ) : (
                <div className="w-full max-w-xs space-y-4">
                    <button onClick={handleHost} className="w-full py-4 bg-[#2d1b4e] border border-white/10 text-white font-bold rounded-2xl">I'm the Host</button>
                    <div className="flex gap-2">
                        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={6} className="flex-1 bg-[#2d1b4e] rounded-xl px-4 text-white text-center uppercase font-bold outline-none"/>
                        <button onClick={handleJoin} className="bg-white text-black px-6 rounded-xl font-bold">Join</button>
                    </div>
                    <div className="pt-8 border-t border-white/10 mt-8">
                        <button onClick={handleSolo} className="w-full py-3 bg-purple-700/50 rounded-full text-purple-200 font-bold hover:bg-purple-700 transition-colors text-sm">Continue Solo (Test Mode)</button>
                    </div>
                </div>
            )}
        </div>
    );
    return null;
};

// --- MAIN UI ---
const Header = memo(() => {
    const { state, dispatch, handleAI } = useContext(AppContext);
    const { tab, ui, data } = state;
    const { analyzing, user, appMode } = ui;
    const profileName = data.profiles[user]?.name; 
    const title = appMode === 'deeply' ? 'DeeplyUs' : (tab === 'today' ? `Hi, ${profileName || 'User'}` : (tab === 'chat' ? 'Chat' : APP_NAME));

    return (
        <header className="px-5 py-4 flex justify-between items-center bg-[#1a0b2e]/80 backdrop-blur-lg border-b border-white/5 z-20 sticky top-0">
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center text-white font-graffiti text-xl shadow-lg">{APP_NAME.charAt(0)}</div><span className="font-graffiti text-xl tracking-wide text-white truncate max-w-[150px]">{title}</span></div>
            <div className="flex items-center gap-3">{tab === 'chat' && appMode === 'common' && (<button onClick={() => handleAI('analyze_chat', null)} disabled={analyzing} className={`h-9 px-4 rounded-full flex items-center gap-2 font-bold text-xs transition-all ${analyzing ? 'bg-purple-800/50 text-purple-300' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'}`}>{analyzing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3" />} Get Advice</button>)}<div className="flex items-center gap-2 bg-[#2d1b4e] rounded-full p-1 border border-white/5"><button onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { appMode: 'common' }})} className={`px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 font-bold text-sm transition-all ${appMode === 'common' ? 'bg-orange-500 text-white shadow-md' : 'text-purple-300/50 hover:bg-white/5'}`}><Heart className="w-4 h-4" /><span className="hidden sm:inline">Common</span></button><button onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { appMode: 'deeply' }})} className={`px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 font-bold text-sm transition-all ${appMode === 'deeply' ? 'bg-rose-600 text-white shadow-md' : 'text-purple-300/50 hover:bg-white/5'}`}><Flame className="w-4 h-4" /><span className="hidden sm:inline">Deeply</span></button></div></div>
        </header>
    );
});

const TodayTab = memo(() => {
    const { state, dispatch, handleShare, sendMsg, handleAI, simpleAdd } = useContext(AppContext);
    const { sparkIdx, dailySpark, loading, user } = state.ui;
    const { messages, growth, intimacy } = state.data;
    const [resp, setResp] = useState('');
    
    const currentSpark = dailySpark || "What is one thing you love about us?";

    const handleSave = () => {
        simpleAdd('answered_sparks', { question: currentSpark, answer: resp, addedBy: user }, null);
        dispatch({type: 'SET_TAB', payload: 'chat'});
        sendMsg(`✨ **Daily Spark:** ${currentSpark}\n\n**My Answer:** ${resp}`);
        setResp('');
    }

    return (
        <div className="p-5 space-y-6 pb-24">
             <Card gradient="linear-gradient(135deg, #ea580c 0%, #db2777 100%)" className="text-white min-h-[200px] flex flex-col justify-center">
                <div className="text-xs font-bold opacity-90 mb-2"><Sparkles className="w-3 h-3 inline mr-1"/> Daily Spark</div>
                <h2 className="text-2xl font-graffiti mb-4">{loading.spark ? "Generating..." : currentSpark}</h2>
                <textarea value={resp} onChange={e=>setResp(e.target.value)} placeholder="Your answer..." className="w-full bg-white/10 rounded-xl p-3 text-white placeholder-white/50 outline-none border border-white/20 mb-4 text-sm h-20"/>
                <div className="flex gap-2 mt-auto">
                    <button onClick={()=>handleAI('generate_spark')} disabled={loading.spark} className="bg-white/20 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1">{loading.spark ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>} New</button>
                    <button onClick={handleSave} className="bg-white text-rose-600 px-4 py-2 rounded-full text-xs font-bold ml-auto">Save & Discuss</button>
                </div>
            </Card>
            <div className="bg-white/5 p-4 rounded-2xl flex justify-between text-center">
                <div><div className="text-white font-bold text-xl">{messages?.length || 0}</div><div className="text-xs text-purple-400">Msgs</div></div>
                <div><div className="text-white font-bold text-xl">{growth?.length || 0}</div><div className="text-xs text-purple-400">Modules</div></div>
                <div><div className="text-white font-bold text-xl">{intimacy?.length || 0}</div><div className="text-xs text-purple-400">Sparks</div></div>
            </div>
        </div>
    );
});

const ChatTab = memo(() => {
    const { state, sendMsg, handleAI, handleShare } = useContext(AppContext);
    const { messages } = state.data;
    const { user, loading, inputs } = state.ui;
    const [chatInput, setChatInput] = useState(inputs.chat || '');
    const msgsEndRef = useRef(null);

    useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    useEffect(() => { if(state.inputs.chat) { setChatInput(state.inputs.chat); } }, [state.inputs.chat]);

    const handleSend = () => {
        sendMsg(chatInput);
        setChatInput('');
    };

    return (
        <div className="flex flex-col h-full bg-[#0f0518]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                {(messages || []).map(m => <MemoizedMessage key={m.id} m={m} isMe={m.sender===user} isAI={m.sender.includes('ai')} handleShare={handleShare} />)}
                {loading.global && <div className="text-center text-xs text-purple-400">Analyzing...</div>}
                <div ref={msgsEndRef}/>
            </div>
            <div className="absolute bottom-20 left-4 right-4 flex gap-2 items-end">
                <div className="flex-1 relative">
                     <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} className="w-full bg-[#2d1b4e] rounded-2xl px-4 py-3 text-white outline-none border border-white/10 resize-none" rows={1} placeholder="Message..."/>
                     <button onClick={()=>handleAI('draft_reply')} disabled={loading.draft} className="absolute right-2 top-2 text-purple-400 p-1">{loading.draft ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>}</button>
                </div>
                <button onClick={handleSend} className="bg-orange-500 p-3 rounded-full text-white h-12 w-12 flex items-center justify-center"><Send className="w-5 h-5"/></button>
            </div>
        </div>
    );
});

const UsTab = () => {
    const { state, dispatch, handleAI, simpleAdd, deleteDoc, updateDoc } = useContext(AppContext);
    const { subView, ui, data, inputs } = state;
    const { activeMod, loading, user } = ui;
    const { art, answeredSparks, shopping, wishlist, events, couplePortraits } = data;
    
    const [listIn, setListIn] = useState('');

    return (
        <div className="p-5 pb-24 space-y-6">
            <MemoizedToggle options={[{id:'growth', label:'Pathways', icon:Compass}, {id:'sparks', label:'Sparks', icon:Sparkles}, {id:'calendar', label:'Calendar', icon:CalendarIcon}, {id:'lists', label:'Lists', icon:LayoutGrid}, {id:'portraits', label:'Portraits', icon:Camera}]} active={subView.us} onChange={(id)=>dispatch({type:'SET_SUBVIEW', payload:{us:id}})}/>
            
            {subView.us === 'growth' && ( activeMod ? 
                <div className="bg-[#2d1b4e] rounded-3xl overflow-hidden border border-white/10"><div className="h-48 bg-slate-900 relative"><img src={art?.[activeMod.id]} className="w-full h-full object-cover opacity-80"/><button onClick={()=>dispatch({type:'SET_UI_STATE', payload:{activeMod:null}})} className="absolute top-4 left-4 bg-black/50 p-2 rounded-full text-white"><X/></button> <button onClick={()=>handleAI('art', activeMod.prompt)} className="absolute bottom-4 right-4 bg-orange-600 px-3 py-1 rounded-full text-xs text-white font-bold flex items-center gap-1"><Zap className="w-3 h-3"/> Art</button></div><div className="p-5"><h2 className="text-2xl font-graffiti text-white mb-2">{activeMod.title}</h2><p className="text-purple-200 mb-4 text-sm">{activeMod.desc}</p><div className="bg-white/5 p-3 rounded-xl"><div className="flex justify-between items-center mb-2"><h4 className="text-orange-400 text-xs font-bold uppercase">Daily Practice</h4><button onClick={()=>handleAI('generate_exercise', activeMod.title)} disabled={loading.exercise} className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded">{loading.exercise ? "..." : "Generate"}</button></div><p className="text-white text-sm">{ui.moduleExercise || "Click generate for an exercise."}</p></div></div></div>
            : <div className="grid gap-4">{MODULES.map(m=>(<div key={m.id} onClick={()=>dispatch({type:'SET_UI_STATE', payload:{activeMod:m}})} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10"><h3 className="font-graffiti text-xl text-white">{m.title}</h3><p className="text-sm text-purple-300">{m.desc}</p></div>))}</div> )}

            {subView.us === 'sparks' && (
                <div className="space-y-4">
                    <h3 className="text-xl font-graffiti text-white">Answered Sparks</h3>
                    {(answeredSparks || []).map(s => <div key={s.id} className="bg-[#2d1b4e] p-4 rounded-2xl border border-white/10"><p className="text-white font-bold mb-2">{s.question}</p><p className="text-purple-200 text-sm italic">"{s.answer}"</p></div>)}
                </div>
            )}

            {subView.us === 'portraits' && (
                <div className="space-y-4 text-center">
                    <div className="bg-gradient-to-br from-purple-900 to-indigo-900 p-6 rounded-3xl border border-white/10">
                        <Camera className="w-10 h-10 text-white mx-auto mb-4"/>
                        <h3 className="text-2xl font-graffiti text-white mb-2">Couple Portraits</h3>
                        <button onClick={()=>handleAI('generate_couple_art')} disabled={loading.portrait} className="bg-white text-purple-900 px-6 py-2 rounded-full font-bold shadow-lg">{loading.portrait ? "Painting..." : "Generate New"}</button>
                    </div>
                    <div className="grid gap-4">{(couplePortraits || []).map(p => <div key={p.id} className="bg-[#2d1b4e] p-2 rounded-2xl"><img src={p.url} className="w-full rounded-xl bg-black/50 min-h-[200px] object-cover"/><div className="flex justify-end p-1"><button onClick={()=>deleteDoc(`couple_portraits/${p.id}`)}><Trash2 className="w-4 h-4 text-purple-500"/></button></div></div>)}</div>
                </div>
            )}

            {subView.us === 'lists' && (
                <div className="space-y-4">
                    <div className="flex gap-2"><button onClick={()=>dispatch({type:'SET_SUBVIEW', payload:{listMode:'shopping'}})} className={`flex-1 py-2 rounded-xl font-bold text-sm ${subView.listMode!=='wish'?'bg-orange-500 text-white':'bg-[#2d1b4e] text-purple-400'}`}>Shopping</button><button onClick={()=>dispatch({type:'SET_SUBVIEW', payload:{listMode:'wish'}})} className={`flex-1 py-2 rounded-xl font-bold text-sm ${subView.listMode==='wish'?'bg-orange-500 text-white':'bg-[#2d1b4e] text-purple-400'}`}>Wishes</button></div>
                    <div className="flex gap-2"><input value={listIn} onChange={e=>setListIn(e.target.value)} placeholder={subView.listMode==='wish'?"Gift idea...":"Item or 'Tacos'..."} className="flex-1 bg-[#2d1b4e] rounded-xl px-4 text-white outline-none"/><button onClick={()=>{ subView.listMode==='wish'?handleAI('gift_ideas',listIn):handleAI('get_ingredients',listIn); setListIn(''); }} className="bg-[#2d1b4e] w-12 rounded-xl flex items-center justify-center text-orange-400"><Sparkles/></button><button onClick={()=>{ simpleAdd(subView.listMode==='wish'?'wishlist_items':'shopping_list', {text:listIn, addedBy:user}, null); setListIn(''); }} className="bg-orange-500 w-12 rounded-xl flex items-center justify-center text-white"><Plus/></button></div>
                    {(subView.listMode==='wish'?wishlist:shopping).map(i=><div key={i.id} className="bg-[#2d1b4e] p-4 rounded-2xl flex justify-between items-center"><span className="text-white">{i.text}</span><button onClick={()=>deleteDoc(`${subView.listMode==='wish'?'wishlist_items':'shopping_list'}/${i.id}`)} className="text-purple-500"><Trash2 className="w-4 h-4"/></button></div>)}
                </div>
            )}
        </div>
    );
};

const MeTab = () => {
    const { state, dispatch, updateProfile, handleAI, linkAccount, handleShare, simpleAdd } = useContext(AppContext);
    const { subView, ui, data, inputs } = state;
    const { user, loading, generatedNote, ventAnalysis, showVentIntro, analyzing, linkSuccess, linkError } = ui;
    const { journal, profiles } = data;
    const [noteTopic, setNoteTopic] = useState('');
    const [appearance, setAppearance] = useState(profiles?.[user]?.appearance || '');
    const [journalInput, setJournalInput] = useState('');
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [qaInput, setQaInput] = useState('');
    
    const profile = profiles?.[user] || {};

    return (
        <div className="p-5 pb-24 space-y-6 text-center">
            <MemoizedToggle options={[{id:'profile', label:'Profile', icon:User}, {id:'vent', label:'Confessional', icon:Video}]} active={subView.me} onChange={(id)=>dispatch({type:'SET_SUBVIEW', payload:{me:id}})} />
            
            {subView.me === 'profile' && (
                <>
                     <div className="w-24 h-24 mx-auto bg-[#2d1b4e] rounded-full border-2 border-orange-500 flex items-center justify-center text-4xl font-graffiti text-white overflow-hidden">
                         {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover"/> : profile.name?.charAt(0).toUpperCase()}
                     </div>
                     <h2 className="text-2xl font-graffiti text-white">{profile.name}</h2>
                     
                     {/* Settings / Account Linking */}
                     <button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { modal: 'settings' } })} className="text-xs text-purple-400 underline hover:text-white">Settings / Link Account</button>
                     {ui.modal === 'settings' && (
                         <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
                             <div className="bg-[#1a0b2e] p-6 rounded-3xl w-full border border-white/10">
                                 <h3 className="text-xl text-white mb-4 font-bold">Account Settings</h3>
                                 <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full bg-white/10 p-3 rounded-xl mb-2 text-white"/>
                                 <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password" className="w-full bg-white/10 p-3 rounded-xl mb-4 text-white"/>
                                 <button onClick={()=>linkAccount(email, pass)} disabled={loading.settings} className="w-full bg-orange-500 py-3 rounded-xl text-white font-bold mb-2">{loading.settings ? "Linking..." : "Link Account"}</button>
                                 {linkSuccess && <p className="text-green-400 text-xs">{linkSuccess}</p>}
                                 {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
                                 <button onClick={()=>{localStorage.clear(); window.location.reload()}} className="w-full py-3 text-red-400 text-xs">Log Out</button>
                                 <button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { modal: null } })} className="mt-4 text-purple-400 text-sm">Close</button>
                             </div>
                         </div>
                     )}

                     {/* COSMIC PROFILE DISPLAY */}
                     {profile.astrology && (
                         <div className="bg-indigo-900/30 p-4 rounded-2xl border border-indigo-500/30 text-left">
                             <h4 className="text-xs text-indigo-300 font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><Star className="w-3 h-3"/> Cosmic Profile</h4>
                             <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                                 <div className="bg-black/20 p-2 rounded-lg"><div className="text-[10px] text-purple-400">SUN</div><div className="text-white font-bold text-sm">{profile.astrology.sun?.split(' - ')[0]}</div></div>
                                 <div className="bg-black/20 p-2 rounded-lg"><div className="text-[10px] text-purple-400">MOON</div><div className="text-white font-bold text-sm">{profile.astrology.moon?.split(' - ')[0]}</div></div>
                                 <div className="bg-black/20 p-2 rounded-lg"><div className="text-[10px] text-purple-400">RISING</div><div className="text-white font-bold text-sm">{profile.astrology.rising?.split(' - ')[0]}</div></div>
                             </div>
                             <p className="text-xs text-indigo-100 italic border-t border-white/10 pt-2">"{profile.astrology.summary}"</p>
                         </div>
                     )}

                     <div className="bg-[#2d1b4e] p-4 rounded-2xl text-left">
                        <h4 className="text-xs text-purple-400 font-bold uppercase mb-2">My Appearance</h4>
                        <textarea value={appearance} onChange={e=>setAppearance(e.target.value)} onBlur={()=>updateProfile('appearance', appearance)} className="w-full bg-black/20 rounded-lg p-2 text-white text-sm h-16 resize-none" placeholder="e.g. Short hair, glasses..."/>
                    </div>
                    <div className="bg-[#2d1b4e] p-4 rounded-2xl text-left">
                        <h4 className="text-xs text-purple-400 font-bold uppercase mb-2 flex items-center gap-2"><PenTool className="w-3 h-3"/> Ghostwriter</h4>
                        <div className="flex gap-2 mb-2"><input value={noteTopic} onChange={e=>setNoteTopic(e.target.value)} className="flex-1 bg-black/20 rounded-lg p-2 text-white text-sm" placeholder="Topic (e.g. Miss you)"/><button onClick={()=>handleAI('write_note', noteTopic)} disabled={loading.note} className="bg-purple-600 text-white px-3 rounded-lg text-xs font-bold">{loading.note?"...":"Write"}</button></div>
                        {generatedNote && (<div className="bg-[#1a0b2e] p-3 rounded-xl border border-white/10 relative animate-in fade-in"><p className="text-purple-100 text-sm italic">"{generatedNote}"</p><button onClick={() => handleShare({text: generatedNote})} className="absolute top-2 right-2 text-purple-400 hover:text-white"><Share2 className="w-3 h-3"/></button><button onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { generatedNote: null } })} className="absolute bottom-2 right-2 text-purple-500 hover:text-white text-[10px]">Clear</button></div>)}
                    </div>
                    
                    <button onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { modal: 'pairCode' } })} className="text-xs text-purple-400 underline -mt-2 block hover:text-white cursor-pointer">View Partner Code</button>

                    <div className="text-left animate-in fade-in">
                        <div className="flex justify-between items-end mb-2"><div className="text-xs text-purple-400 font-bold uppercase tracking-widest flex items-center gap-2"><Music className="w-3 h-3"/> In Rotation</div><button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { modal: 'addSong' } })} className="text-orange-400 hover:text-orange-300"><Plus className="w-4 h-4"/></button></div>
                        <div className="flex gap-3 overflow-x-auto hide-scroll pb-2">{(profiles[user]?.playlist || []).map(s => (<div key={s.id} className="min-w-[100px] bg-[#2d1b4e]/60 p-2 rounded-xl border border-white/5 relative group"><img src={s.cover} className="w-full aspect-square object-cover rounded-lg mb-2 opacity-80 group-hover:opacity-100 transition-opacity"/><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-xl pointer-events-none"><Play className="w-8 h-8 text-white fill-white"/></div><div className="text-xs font-bold text-white truncate">{s.title}</div><div className="text-[10px] text-purple-400 truncate">{s.artist}</div></div>))}</div>
                    </div>

                    <div className="text-left animate-in fade-in">
                        <div className="flex justify-between items-end mb-2"><div className="text-xs text-purple-400 font-bold uppercase tracking-widest flex items-center gap-2"><Tv className="w-3 h-3"/> Watching Now</div><div className="flex bg-[#2d1b4e] rounded-lg p-0.5"><button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { mediaTab: 'anime' } })} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${ui.mediaTab==='anime'?'bg-purple-600 text-white':'text-purple-400'}`}>Anime</button><button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { mediaTab: 'shows' } })} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${ui.mediaTab==='shows'?'bg-purple-600 text-white':'text-purple-400'}`}>Shows</button></div></div>
                        <div className="bg-[#2d1b4e]/40 rounded-2xl p-3 border border-white/5">
                             <div className="flex gap-3 overflow-x-auto hide-scroll pb-1">
                                {(profiles[user]?.watching?.[ui.mediaTab] || []).map(m => (
                                    <div key={m.id} className="min-w-[110px] relative group cursor-pointer">
                                        <div className="absolute top-1 right-1 bg-black/80 text-[8px] px-1.5 py-0.5 rounded text-white border border-white/10 z-10">User Added</div>
                                        {/* Placeholder image based on title if no cover */}
                                        <img src={`https://placehold.co/150x220/333/FFF?text=${m.title.charAt(0)}`} className="w-full aspect-[2/3] object-cover rounded-lg mb-1 shadow-lg"/>
                                        <div className="h-1 bg-[#1a0b2e] rounded-full overflow-hidden mb-1"><div className="h-full bg-orange-500 w-3/4 rounded-full"></div></div>
                                        <div className="text-xs font-bold text-white truncate">{m.title}</div>
                                        <div className="text-[10px] text-purple-400">{m.ep}</div>
                                    </div>
                                ))}
                                <button 
                                    onClick={() => dispatch({ type: 'SET_UI_STATE', payload: { modal: 'addMedia' } })}
                                    className="min-w-[110px] bg-[#2d1b4e] rounded-xl border-2 border-dashed border-purple-500/30 flex flex-col items-center justify-center text-purple-400 hover:text-white hover:border-purple-500/50 transition-colors"
                                >
                                    <Plus className="w-6 h-6 mb-1"/><span className="text-xs font-bold">Connect</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <Card title="Q&A" action={<button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { qIdx: Math.floor(Math.random()*QUESTIONS.length) } })}><Shuffle className="w-4 h-4 text-purple400 hover:text-white"/></button>}>
                        <h3 className="text-xl mb-2 font-graffiti text-white">{QUESTIONS[0].text}</h3>
                        <div className="flex gap-2"><input value={qaInput} onChange={e=>setQaInput(e.target.value)} className="flex-1 bg-[#1a0b2e] rounded-xl px-4 py-2 border border-white/10 outline-none focus:border-orange-500 text-white" placeholder="Type here..."/><button onClick={()=>{updateProfile(`favorites.${QUESTIONS[0].key}`, qaInput); setQaInput('')}} className="bg-orange-500 px-4 rounded-xl font-bold hover:bg-orange-400 text-white">Save</button></div>
                    </Card>
                    <div className="grid grid-cols-2 gap-3 text-left">{QUESTIONS.map(q => {const ans = profiles[user]?.favorites?.[q.key]; return ans ? <div key={q.id} className="bg-[#2d1b4e] p-3 rounded-xl border border-white/5"><div className="text-xs text-purple-400 uppercase font-bold tracking-wider mb-1">{q.key}</div><div className="text-lg flex items-center gap-2 text-white">{q.icon} {ans}</div></div> : null;})}</div>
                </>
            )}

            {subView.me === 'vent' && (
                showVentIntro ? (
                     <div className="bg-[#f8fafc] text-slate-900 rounded-3xl p-8 shadow-xl">
                        <h2 className="text-3xl font-graffiti text-slate-900 mb-4">The Confessional</h2>
                        <p className="mb-6 text-slate-700">Step into the booth. Off the record venting.</p>
                        <button onClick={()=>dispatch({ type: 'SET_UI_STATE', payload: { showVentIntro: false } })} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold">Enter Booth</button>
                     </div>
                ) : (
                    <div className="space-y-6">
                         <div className="bg-[#2d1b4e] p-1 rounded-[32px] border border-white/10 relative shadow-2xl">
                            <textarea value={journalInput} onChange={e=>setJournalInput(e.target.value)} className="w-full h-40 bg-transparent text-lg text-white outline-none resize-none p-6" placeholder="Speak your truth..."/>
                            <div className="flex justify-end p-4 pt-0"><button onClick={()=>handleAI('vent_analysis', journalInput)} disabled={analyzing} className="bg-white text-[#0f0518] px-4 py-2 rounded-xl font-bold text-sm">{analyzing ? "..." : "Analyze"}</button></div>
                        </div>
                        {ventAnalysis && <ConfessionalCard analysis={ventAnalysis} />}
                        {ventAnalysis && <button onClick={()=>{simpleAdd('journal_entries', {text:journalInput, analysis:ventAnalysis, author:user}, 'journal'); dispatch({ type: 'SET_UI_STATE', payload: { ventAnalysis: null } }); setJournalInput('');}} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl">Archive Footage</button>}
                    </div>
                )
            )}
        </div>
    );
};

const DeeplyUsTab = () => {
    const { state, dispatch, handleAI, simpleAdd } = useContext(AppContext);
    const { ui, data, inputs } = state;
    const { deeplyLock, igniteSuggestion, loading, user } = ui; 
    const { intimacy } = data;
    const [fan, setFan] = useState('');
    const setInput = (key, value) => dispatch({ type: 'SET_INPUT', payload: { key, value }});

    if(deeplyLock) return <div className="h-full flex flex-col items-center justify-center p-6 text-center"><Lock className="w-12 h-12 text-rose-500 mb-4"/><h2 className="text-2xl text-white font-graffiti mb-2">DeeplyUs</h2><button onClick={()=>dispatch({type:'SET_UI_STATE', payload:{deeplyLock:false}})} className="bg-rose-600 text-white px-8 py-3 rounded-full font-bold shadow-lg">Unlock</button></div>;

    return (
        <div className="p-5 pb-24 space-y-6">
            <button onClick={()=>handleAI('intimacy_advice', 'spicy tip')} disabled={loading.ignite} className="w-full py-4 bg-gradient-to-r from-orange-500 to-rose-600 rounded-2xl text-white font-bold text-xl shadow-lg flex items-center justify-center gap-2">{loading.ignite ? <Loader2 className="animate-spin"/> : <Flame/>} Ignite</button>
            {igniteSuggestion && <Card className="mt-4 bg-rose-900/40 border-rose-500" title="Suggestion" icon={Flame}><p className="text-rose-100">{igniteSuggestion}</p></Card>}
            <div className="flex gap-2"><input value={fan} onChange={e=>setFan(e.target.value)} className="flex-1 bg-[#2d1b4e] rounded-xl px-4 text-white" placeholder="Share a fantasy..."/><button onClick={()=>{simpleAdd('intimacy_items', {text:fan, addedBy:user}, null); setFan('');}} className="bg-rose-600 w-12 h-12 rounded-xl flex items-center justify-center text-white"><Plus/></button></div>
            {intimacy.map(i=><div key={i.id} className="bg-[#2d1b4e] p-4 rounded-xl text-purple-100">{i.text}</div>)}
        </div>
    );
};

const ModalManager = memo(() => {
    const { state, dispatch, simpleAdd, updateProfile, sendMsg, db, updateDoc: updateDocCb } = useContext(AppContext);
    const { modal, user, mediaTab } = state.ui;
    const { eventTitle, eventTime, songTitle, songArtist, imgUrl, mediaTitle, mediaEp } = state.inputs;
    const { profiles } = state.data;
    const uploadFile = state.uploadFile;

    const setInput = (key, value) => dispatch({ type: 'SET_INPUT', payload: { key, value }});
    const setUploadFile = (file) => dispatch({ type: 'SET_UPLOAD_FILE', payload: file });
    const closeModal = () => dispatch({ type: 'SET_UI_STATE', payload: { modal: null }});
    const resetInputs = (keys) => dispatch({ type: 'RESET_INPUTS', payload: keys });

    const handleAddSong = () => {
        const newSong = { id: crypto.randomUUID(), title: songTitle, artist: songArtist, cover: `https://placehold.co/100x100/333/FFF?text=${songTitle.charAt(0)}` };
        const currentList = profiles[user]?.playlist || [];
        updateDocCb(`profiles/${user}`, { playlist: [...currentList, newSong] });
        resetInputs(['songTitle', 'songArtist']);
        closeModal();
    };

    const handleAddMedia = () => {
        const newItem = { id: crypto.randomUUID(), title: mediaTitle, ep: mediaEp, source: 'User' };
        const currentWatching = profiles[user]?.watching || { anime: [], shows: [] };
        const updatedList = [...(currentWatching[mediaTab] || []), newItem];
        updateDocCb(`profiles/${user}`, { watching: { ...currentWatching, [mediaTab]: updatedList } });
        resetInputs(['mediaTitle', 'mediaEp']);
        closeModal();
    };

    const handleAddEvent = () => {
        simpleAdd('calendar_events', {title:eventTitle, time:eventTime, date:state.ui.calSel.toISOString().split('T')[0], createdBy:user}, 'eventTitle');
        resetInputs(['eventTitle', 'eventTime']);
        closeModal();
    };

    const handleSendMedia = () => {
        if (uploadFile) {
            const reader = new FileReader();
            reader.onload = (e) => sendMsg(uploadFile.name, e.target.result, uploadFile.type);
            reader.readAsDataURL(uploadFile);
        } else if (imgUrl.trim()) {
            const mediaType = imgUrl.match(/\.(mp4|mov)/i) ? 'video/mp4' : 'image/png';
            sendMsg('', imgUrl, mediaType);
        }
        setUploadFile(null);
        setInput('imgUrl', '');
        closeModal();
    };
    
    if (!modal) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            {modal === 'addSong' && <div className="bg-[#2d1b4e] p-6 rounded-3xl w-full"><input value={songTitle} onChange={e=>setInput('songTitle', e.target.value)} placeholder="Title" className="w-full mb-2 p-2 rounded"/><input value={songArtist} onChange={e=>setInput('songArtist', e.target.value)} placeholder="Artist" className="w-full mb-2 p-2 rounded"/><button onClick={handleAddSong} className="bg-white text-black p-2 rounded w-full">Save</button><button onClick={closeModal} className="mt-2 w-full text-white">Cancel</button></div>}
            {modal === 'addMedia' && <div className="bg-[#2d1b4e] p-6 rounded-3xl w-full"><input value={mediaTitle} onChange={e=>setInput('mediaTitle', e.target.value)} placeholder="Title" className="w-full mb-2 p-2 rounded"/><input value={mediaEp} onChange={e=>setInput('mediaEp', e.target.value)} placeholder="Ep" className="w-full mb-2 p-2 rounded"/><button onClick={handleAddMedia} className="bg-white text-black p-2 rounded w-full">Save</button><button onClick={closeModal} className="mt-2 w-full text-white">Cancel</button></div>}
            {modal === 'pairCode' && <div className="bg-[#2d1b4e] p-6 rounded-3xl text-white text-center"><h3 className="text-xl mb-4">Partner Code</h3><p className="text-4xl font-bold mb-6">{state.ui.pairingData?.code}</p><button onClick={closeModal} className="bg-white text-black px-6 py-2 rounded-full">Close</button></div>}
            {modal === 'event' && (
                <div className="bg-[#1a0b2e] p-6 rounded-3xl w-full border border-white/10 shadow-2xl">
                    <h3 className="font-graffiti text-2xl mb-4 text-white">New Plan</h3>
                    <div className="flex gap-2 mb-3">
                        <input value={eventTitle} onChange={e=>setInput('eventTitle', e.target.value)} placeholder="Title (e.g. 'Pizza night')" className="flex-1 w-full bg-[#2d1b4e] p-3 rounded-xl outline-none text-white border border-white/10 focus:border-orange-500"/>
                    </div>
                    <input type="time" value={eventTime} onChange={e=>setInput('eventTime', e.target.value)} className="w-full bg-[#2d1b4e] p-3 rounded-xl mb-4 outline-none text-white border border-white/10 focus:border-orange-500"/>
                    <div className="flex gap-2">
                        <button onClick={closeModal} className="flex-1 py-3 bg-[#2d1b4e] rounded-xl font-bold text-purple-400 hover:bg-[#3d2b5e]">Cancel</button>
                        <button onClick={handleAddEvent} className="flex-1 py-3 bg-orange-500 rounded-xl font-bold text-white hover:bg-orange-400">Save</button>
                    </div>
                </div>
            )}
            {modal === 'img' && (
                <div className="bg-[#1a0b2e] p-6 rounded-3xl w-full border border-white/10 shadow-2xl">
                    <h3 className="font-graffiti text-2xl mb-4 text-white">Attach Media (NSFW Ready)</h3>
                    <div className="space-y-4">
                        <div className="bg-[#2d1b4e] p-3 rounded-xl border border-white/10">
                            <label htmlFor="media-upload" className="w-full flex items-center justify-center py-2 text-purple-300 font-bold cursor-pointer hover:text-orange-400 transition-colors">
                                <Upload className="w-5 h-5 mr-2"/> {uploadFile ? `Ready: ${uploadFile.name}` : 'Tap to Upload Photo or Video'}
                            </label>
                            <input id="media-upload" type="file" accept="image/*,video/*" onChange={(e) => setUploadFile(e.target.files[0])} className="hidden" />
                        </div>
                        <p className="text-center text-purple-400/50 text-xs">OR</p>
                        <input value={imgUrl} onChange={e=>setInput('imgUrl', e.target.value)} placeholder="Paste Image/Video URL..." className="w-full bg-[#2d1b4e] p-3 rounded-xl outline-none text-white border border-white/10 focus:border-orange-500"/>
                    </div>
                    <div className="flex gap-2 mt-6">
                        <button onClick={()=>{closeModal(); setUploadFile(null); setInput('imgUrl','')}} className="flex-1 py-3 bg-[#2d1b4e] rounded-xl font-bold text-purple-400 hover:bg-[#3d2b5e]">Cancel</button>
                        <button onClick={handleSendMedia} disabled={!uploadFile && !imgUrl.trim()} className="flex-1 py-3 bg-orange-500 rounded-xl font-bold text-white hover:bg-orange-400 disabled:opacity-50">Send</button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default App;