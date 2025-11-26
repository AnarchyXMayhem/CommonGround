import { useContext, useCallback } from 'react';
import { AppContext } from '../AppContext';
import { addDoc, collection, serverTimestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
import { extractJSON } from '../utils/helpers';

const GEMINI_API_KEY = "AIzaSyA_fQ5WA1FoIF81zY37G7Ndrwr2mRYitHU";
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent`;
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generate`;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export const useAppActions = () => {
  const { state, dispatch, db } = useContext(AppContext);

  const simpleAdd = useCallback(async (collectionKey, payload, inputKey) => {
    if (!db) return;
    const finalPayload = { ...payload, pairId: state.pairId || 'solo', createdAt: serverTimestamp() };
    await addDoc(collection(db, `artifacts/${appId}/public/data/${collectionKey}`), finalPayload);
    if (inputKey) dispatch({ type: 'RESET_INPUTS', payload: [inputKey] });
  }, [db, state.pairId, dispatch]);

  const updateProfile = useCallback(async (key, val) => {
    if (!db || !state.ui.user) return;
    await setDoc(doc(db, `artifacts/${appId}/public/data/profiles`, state.ui.user), { [key]: val }, { merge: true });
  }, [db, state.ui.user]);

  const deleteDocCb = useCallback(async (path) => {
    if (db) await deleteDoc(doc(db, `artifacts/${appId}/public/data/${path}`));
  }, [db]);

  const updateDocCb = useCallback(async (path, data) => {
    if (db) await updateDoc(doc(db, `artifacts/${appId}/public/data/${path}`), data);
  }, [db]);

  const sendMsg = useCallback(async (txt, mediaBase64, mediaType, draftAudio) => {
    if (!db) return;
    let finalMedia = mediaBase64;
    let finalType = mediaType || 'text';
    if (draftAudio) {
      finalType = 'audio';
      finalMedia = await new Promise((r) => {
        const rr = new FileReader();
        rr.onloadend = () => r(rr.result);
        rr.readAsDataURL(draftAudio);
      });
    }
    await setDoc(doc(db, `artifacts/${appId}/public/data/argument_chats/main_chat`), {
      messages: [...state.data.messages, { id: crypto.randomUUID(), sender: state.ui.user, text: txt || '', type: finalType, media: finalMedia || null, timestamp: Date.now() }],
      appId
    }, { merge: true });
  }, [db, state.data.messages, state.ui.user]);

  return { simpleAdd, updateProfile, deleteDocCb, updateDocCb, sendMsg };
};
