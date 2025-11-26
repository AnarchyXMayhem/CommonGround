import React, { useState, useEffect, useRef, useMemo, useReducer, useContext, useCallback, memo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, deleteDoc, collection, onSnapshot, serverTimestamp, query, orderBy, limit, updateDoc, getDoc, where } from 'firebase/firestore';
import { Loader2, Trash2, Book, MessageCircle, Calendar as CalendarIcon, Send, Sparkles, Image as ImageIcon, User, Shuffle, CheckCircle, Flame, Lock, Plus, X, Compass, LayoutGrid, Zap, ArrowRight, Home, Heart, BrainCircuit, Mic, MicOff, Clapperboard, Film, Music, Tv, Share2, Upload, PenTool, Gift, Link, Copy, Check, Camera, Palette, Download, Lightbulb, Star, Video, Settings, LogOut, RefreshCw, Play } from 'lucide-react';

// --- IMPORTS ---
import { AppContext } from './AppContext'; //
import BottomNav from './components/BottomNav'; //

// --- CONFIGURATION ---
const APP_NAME = "Common Ground";
// SECURED: Using environment variable
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 
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
// Helper for Avatar Studio
