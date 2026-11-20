import React from "react";
import { useConfirm } from './ui/ConfirmProvider.jsx';
import AppRoutes from "./app/AppRoutes.jsx";
import { useTheme } from "./app/useTheme.js";
import { useToast } from "./app/useToast.js";
import { useSheetSession } from "./app/useSheetSession.js";
import { useAccountSession } from "./app/useAccountSession.js";
import { useCloudSync } from "./app/useCloudSync.js";
import { useAuth } from "./features/auth/useAuth.js";
import { useHashRoute } from "./lib/router.js";
import { useAutosave } from "./features/library/useAutosave.js";
import { useBenefitClaims } from "./features/library/useBenefitClaims.js";
import { useRewardSync } from "./features/library/useRewardSync.js";
import { useAptitudeNotice } from "./features/library/useAptitudeNotice.js";
import TopBar from "./features/sheet/TopBar.jsx";
import Toast from "./ui/Toast.jsx";
import Assistant from "./assistant/Assistant.jsx";

export default function App() {
  const askConfirm = useConfirm();
  const [theme, setTheme] = useTheme();
  const [toast, setToast] = useToast();
  const auth = useAuth();
  const route = useHashRoute();
  const { session, setSession, sessionRef, storageError } = useSheetSession(setToast);
  const autosave = useAutosave(session, setSession, Boolean(auth.user));
  const { signOut, signingOut } = useAccountSession({ auth, sessionRef, setSession, autosave });
  const sync = useCloudSync({ user: auth.user, sessionRef, setSession, autosave });
  useBenefitClaims(session, setSession, auth.user, setToast);
  useRewardSync(session, setSession, auth.user, setToast);
  useAptitudeNotice(auth.user, setToast);
  const setConfirm = async ({ action, ...options }) => {
    if (await askConfirm(options)) await action();
  };

  return <>
    <TopBar theme={theme} setTheme={setTheme} route={route} auth={auth} onSignOut={signOut} />
    {signingOut && <p className="muted mx-[16px] my-[4px]" role="status">Saindo…</p>}
    <AppRoutes route={route} auth={auth} sheets={{ session, setSession, setConfirm, setToast }} workspace={{ autosave, sync, storageError }} />
    <Toast toast={toast} onClose={() => setToast("")} />
    <Assistant />
  </>;
}
