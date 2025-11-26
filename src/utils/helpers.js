export function extractJSON(text) {
  try {
    const firstCurly = text.indexOf('{');
    const lastCurly = text.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly !== -1) return JSON.parse(text.substring(firstCurly, lastCurly + 1));
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

export function downloadImage(base64Data, filename = 'cg_image.png') {
  try {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("Download failed", e);
  }
}

export const fileToB64 = (file) => new Promise((resolve) => {
  const r = new FileReader();
  r.onload = (e) => resolve(e.target.result);
  r.readAsDataURL(file);
});

export const STORAGE_VERSION = "v1";
export const STORAGE_PREFIX = `cg_beta_${STORAGE_VERSION}`;

export const betaStorage = {
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
      if (result) return JSON.parse(result);
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
