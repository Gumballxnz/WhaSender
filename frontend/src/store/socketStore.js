import { create } from 'zustand';

const useSocketStore = create((set) => ({
  botStatus: 'disconnected',
  qrCode: null,
  pairingCode: null,
  progress: null,
  stoppedSession: null,
  validationProgress: null,

  setBotStatus: (status) => set({ botStatus: status }),
  setQrCode: (qr) => set({ qrCode: qr }),
  setPairingCode: (code) => set({ pairingCode: code }),
  setProgress: (progress) => set({ progress }),
  setStoppedSession: (stoppedSession) => set({ stoppedSession }),
  setValidationProgress: (validationProgress) => set({ validationProgress }),

  reset: () => set({
    botStatus: 'disconnected',
    qrCode: null,
    pairingCode: null,
    progress: null,
    stoppedSession: null,
    validationProgress: null
  })
}));

export default useSocketStore;
