import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Platform =
  | "instagram" | "facebook" | "whatsapp"
  | "linkedin"  | "twitter"  | "telegram" | "email";

export interface Account {
  id: string;
  platform: Platform;
  display_name: string;
  username?: string;
  avatar_url?: string;
  status: "connected" | "disconnected" | "error" | "connecting";
  last_sync?: string;
}

interface AccountsState {
  accounts: Account[];
  loading: boolean;
  fetchAccounts: () => Promise<void>;
  addAccount: (platform: Platform, credentials: Record<string, string>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  updateStatus: (id: string, status: Account["status"]) => void;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  loading: false,

  fetchAccounts: async () => {
    set({ loading: true });
    try {
      const accounts = await invoke<Account[]>("get_accounts");
      set({ accounts });
    } catch (e) {
      console.error("Failed to fetch accounts:", e);
    } finally {
      set({ loading: false });
    }
  },

  addAccount: async (platform, credentials) => {
    try {
      const account = await invoke<Account>("add_account", { platform, credentials });
      set((s) => ({ accounts: [...s.accounts, account] }));
    } catch (e) {
      console.error("Failed to add account:", e);
      throw e;
    }
  },

  removeAccount: async (id) => {
    try {
      await invoke("remove_account", { id });
      set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
    } catch (e) {
      console.error("Failed to remove account:", e);
    }
  },

  updateStatus: (id, status) => {
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, status } : a)),
    }));
  },
}));
