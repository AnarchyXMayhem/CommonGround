import { useContext, useCallback } from 'react';
import { AppContext } from '../AppContext';
import { addDoc, collection, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { extractJSON } from '../utils/helpers';

const GEMINI_API_KEY = "AIzaSyA_fQ5WA1FoIF81zY37G7Ndrwr2mRYitHU";
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent`;
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generate`;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const promptTemplates = {
  generate_spark: "Act as a relationship coach. Generate one unique, thoughtful 'Daily Spark' conversation starter for a couple. Make it personal and engaging. Return just the question, no extra formatting.",
  intimacy_advice: (ctx) => `Act as a sex-positive relationship coach. Provide a spicy, 18+ suggestion for: ${ctx}. Be playful and specific.`,
  analyze_avatar_photo: "Analyze this face and describe it in detail for an anime character prompt. Include hair color, style, eye color, facial features, and expression. Be concise but vivid.",
  vent_analysis: (ctx) => `Analyze this relationship confession: "${ctx}". Provide response as JSON with these keys: "tone", "actionable", "cheeky". Return ONLY the JSON object, no markdown formatting.`,
  draft_reply: (ctx, recentMsgs) => `Based on this recent conversation:\n${recentMsgs}\n\nSuggest a short, warm, authentic reply. Keep it under 50 words.`,
  write_note: (ctx) => `Write a sweet, romantic note about: ${ctx}. Keep it heartfelt and personal, 2-3 sentences max.`,
  generate_astrology: (ctx) => `Generate a mystical astrology profile for someone born: ${ctx}. Return as JSON with these keys: "sun", "moon", "rising", "summary". Return ONLY the JSON object, no markdown.`,
  get_ingredients: (ctx) => `List 5-7 ingredients needed to make: ${ctx}. Return each ingredient on a new line.`,
  gift_ideas: (ctx) => `Suggest 5 thoughtful gift ideas related to: ${ctx}. Return each idea on a new line.`,
  analyze_chat: (ctx) => `As a relationship counselor, analyze this conversation and give helpful advice: ${ctx}. Keep it supportive and actionable.`,
  generate_exercise: (ctx) => `Create a daily relationship exercise for the module: ${ctx}. Make it specific, actionable, and doable in 10-15 minutes.`,
  plan_date: "Suggest a creative date idea. Be specific about activities, timing, and what makes it special. 2-3 sentences.",
};

export const useAI = (sendMsg, simpleAdd) => {
  const { state, dispatch, db } = useContext(AppContext);

  const handleClaudeText = useCallback(async (task, context, fileBase64 = null) => {
    let prompt = promptTemplates[task];
    if (typeof prompt === 'function') {
      if (task === 'draft_reply') {
        const recentMessages = state.data.messages.slice(-5).map(m => m.text).join('\n');
        prompt = prompt(context, recentMessages);
      } else {
        prompt = prompt(context);
      }
    }

    let payload = { contents: [{ parts: [{ text: prompt }] }] };
    if (task === 'analyze_avatar_photo' && fileBase64) {
      payload = {
        contents: [{
          parts: [
            { text: "Analyze this face for an anime prompt." },
            { inlineData: { mimeType: "image/jpeg", data: fileBase64.split(',')[1] } }
          ]
        }]
      };
    }

    const res = await fetch(`${TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }, [state.data.messages]);

  const handleAI = useCallback(async (task, context, fileBase64 = null) => {
    const loadingKey = task.includes('spark') ? 'spark' : task.includes('ignite') ? 'ignite' : task.includes('avatar') ? 'avatar' : 'global';
    dispatch({ type: 'SET_LOADING', payload: { key: loadingKey, value: true } });
    
    try {
      const isImageGen = ['generate_avatar_final', 'generate_couple_art'].includes(task) || task.includes('art');

      if (isImageGen) {
        let prompt = '';
        if (task === 'generate_avatar_final') prompt = `High quality anime portrait, makoto shinkai style. Description: ${context}`;
        else if (task === 'generate_couple_art') {
          const p1 = state.data.profiles['user1']?.appearance || 'Person';
          const p2 = state.data.profiles['user2']?.appearance || 'Partner';
          prompt = `Anime style couple portrait. ${p1} and ${p2}. Romantic, soft lighting, highly detailed.`;
        } else if (task === 'art') prompt = `High quality anime style art. Description: ${context}`;

        const res = await fetch(`${IMAGE_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, number_of_images: 1, aspect_ratio: "1:1" })
        });
        const json = await res.json();

        if (json.error) throw new Error(json.error.message);

        const b64 = json.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          const imgUrl = `data:image/png;base64,${b64}`;
          if (task === 'generate_couple_art') {
            await addDoc(collection(db, `artifacts/${appId}/public/data/couple_portraits`), { url: imgUrl, createdAt: serverTimestamp() });
          } else if (task === 'generate_avatar_final') {
            dispatch({ type: 'SET_UI_STATE', payload: { tempAvatar: imgUrl } });
          } else if (state.ui.activeMod) {
            await setDoc(doc(db, `artifacts/${appId}/public/data/module_art`, state.ui.activeMod.id), { base64: imgUrl });
          }
        }
      } else {
        const text = await handleClaudeText(task, context, fileBase64);
        if (!text) throw new Error("No response from AI");

        if (task === 'analyze_avatar_photo') return text;
        if (task === 'generate_spark') dispatch({ type: 'SET_UI_STATE', payload: { dailySpark: text.trim() } });
        else if (task === 'intimacy_advice') dispatch({ type: 'SET_UI_STATE', payload: { igniteSuggestion: text.trim() } });
        else if (task === 'draft_reply') dispatch({ type: 'SET_INPUT', payload: { key: 'chat', value: text.trim() } });
        else if (task === 'write_note') {
          dispatch({ type: 'SET_UI_STATE', payload: { generatedNote: text.trim() } });
          dispatch({ type: 'RESET_INPUTS', payload: ['noteTopic'] });
        }
        else if (['get_ingredients', 'gift_ideas'].includes(task)) {
          const items = text.split('\n').filter(Boolean);
          const col = task === 'gift_ideas' ? 'wishlist_items' : 'shopping_list';
          items.forEach(i => simpleAdd(col, { text: i.trim(), addedBy: state.ui.user, checked: false }));
          dispatch({ type: 'RESET_INPUTS', payload: ['list'] });
        }
        else if (task === 'generate_astrology') {
          const analysis = extractJSON(text);
          if (analysis) await updateDoc(doc(db, `artifacts/${appId}/public/data/profiles`, state.ui.user), { astrology: analysis }, { merge: true });
        }
        else if (task === 'analyze_chat') sendMsg(`🤖 **Advice**\n\n${text}`);
        else if (task === 'vent_analysis') {
          const analysis = extractJSON(text);
          if (analysis) dispatch({ type: 'SET_UI_STATE', payload: { ventAnalysis: analysis } });
        }
        else if (task === 'generate_exercise') dispatch({ type: 'SET_UI_STATE', payload: { moduleExercise: text } });
        else if (task === 'plan_date') dispatch({ type: 'SET_UI_STATE', payload: { eventSuggestions: text } });
      }
    } catch (e) {
      console.error("AI Error", e);
      alert("AI Error: " + e.message);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: loadingKey, value: false } });
    }
  }, [db, state, dispatch, sendMsg, simpleAdd, handleClaudeText]);

  return { handleAI };
};
