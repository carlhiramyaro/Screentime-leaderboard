"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  setDoc,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import Image from "next/image";

interface User {
  id: string;
  name: string;
  email: string;
  screenTime: number;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSave: (newName: string) => Promise<void>;
}

const SettingsModal = ({
  isOpen,
  onClose,
  currentName,
  onSave,
}: SettingsModalProps) => {
  const [newName, setNewName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave(newName);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-blue-900/90 p-6 rounded-lg w-full max-w-md border-2 border-cyan-400/30">
        <h2 className="text-xl font-bold mb-4 text-yellow-400">Settings</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-cyan-300">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-blue-800/50 px-4 py-2 rounded border border-cyan-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none"
              required
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-blue-800 text-cyan-300 rounded hover:bg-blue-700 border border-cyan-500/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold rounded shadow-lg shadow-yellow-500/30 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [screenTime, setScreenTime] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);

  // Auth states
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let leaderboardUnsubscribe = () => {};

    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        try {
          // Fetch user's data from Firestore
          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          const userData = userDoc.data();

          setUser({
            ...authUser,
            name: userData?.name || authUser.displayName || "Anonymous",
          });

          // Set up leaderboard listener with simplified query
          const q = query(
            collection(db, "screenTime"),
            orderBy("screenTime", "desc")
          );

          leaderboardUnsubscribe = onSnapshot(
            q,
            async (snapshot) => {
              const users: User[] = [];

              for (const docSnapshot of snapshot.docs) {
                const data = docSnapshot.data() as {
                  userId?: string;
                  name?: string;
                  screenTime: number;
                  email: string;
                };
                if (data.userId) {
                  try {
                    const userDoc = await getDoc(doc(db, "users", data.userId));
                    const userData = userDoc.data() as
                      | { name?: string }
                      | undefined;
                    users.push({
                      id: docSnapshot.id,
                      name: userData?.name || data.name || "Anonymous",
                      screenTime: data.screenTime,
                      email: data.email,
                    } as User);
                  } catch (error) {
                    console.error("Error fetching user data:", error);
                    // Still add the entry even if we can't fetch user details
                    users.push({
                      id: docSnapshot.id,
                      name: data.name || "Anonymous",
                      screenTime: data.screenTime,
                      email: data.email,
                    } as User);
                  }
                } else {
                  // Handle entries without userId
                  users.push({
                    id: docSnapshot.id,
                    name: data.name || "Anonymous",
                    screenTime: data.screenTime,
                    email: data.email,
                  } as User);
                }
              }

              setLeaderboard(users);
            },
            (error) => {
              console.error("Leaderboard listener error:", error);
            }
          );
        } catch (error) {
          console.error("Error setting up listeners:", error);
        }
      } else {
        setUser(null);
        setLeaderboard([]);
      }
    });

    return () => {
      unsubscribe();
      leaderboardUnsubscribe();
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // First update the user's profile
      await updateProfile(userCredential.user, {
        displayName: name,
      });

      // Then store in Firestore with the same name
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name: name,
        email: email,
        createdAt: new Date(),
      });

      // Update local user state
      setUser({
        ...userCredential.user,
        name: name,
      });

      setEmail("");
      setPassword("");
      setName("");
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleSignOut = () => {
    auth.signOut();
  };

  const submitScreenTime = async () => {
    if (!user) return;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();

      const screenTimeData = {
        userId: user.uid,
        name: userData?.name || user.name || user.displayName || "Anonymous",
        email: user.email,
        screenTime: screenTime,
        timestamp: new Date(),
      };

      console.log("Submitting screen time:", screenTimeData); // Debug log

      await addDoc(collection(db, "screenTime"), screenTimeData);
      setScreenTime(0);
    } catch (error: any) {
      console.error("Error submitting screen time:", error);
    }
  };

  // Add function to update user settings
  const handleUpdateSettings = async (newName: string) => {
    if (!user) return;

    try {
      // Update Firestore user document
      await updateDoc(doc(db, "users", user.uid), {
        name: newName,
      });

      // Update auth profile
      await updateProfile(auth.currentUser!, {
        displayName: newName,
      });

      // Update local user state
      setUser((prev: any) => ({
        ...prev,
        name: newName,
      }));
    } catch (error: any) {
      console.error("Error updating settings:", error);
      setError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-950 text-white p-4 md:p-8 font-mono">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse">
          Screen Time Leaderboard
        </h1>

        {!user ? (
          <div className="space-y-8 bg-blue-900/50 p-6 rounded-lg border-2 border-cyan-400/30 shadow-lg shadow-cyan-500/20">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setIsRegistering(false)}
                className={`px-4 py-2 rounded ${
                  !isRegistering
                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                    : "bg-blue-800 text-cyan-300"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setIsRegistering(true)}
                className={`px-4 py-2 rounded ${
                  isRegistering
                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                    : "bg-blue-800 text-cyan-300"
                }`}
              >
                Register
              </button>
            </div>

            <form
              onSubmit={isRegistering ? handleRegister : handleLogin}
              className="space-y-4"
            >
              {isRegistering && (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full bg-blue-800/50 px-4 py-2 rounded border border-cyan-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none"
                  required
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-blue-800/50 px-4 py-2 rounded border border-cyan-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-blue-800/50 px-4 py-2 rounded border border-cyan-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none"
                required
              />
              {error && <p className="text-red-400">{error}</p>}
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold px-6 py-2 rounded shadow-lg shadow-yellow-500/30 transition-all"
              >
                {isRegistering ? "Register" : "Login"}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-between items-center bg-blue-900/50 p-4 rounded-lg border-2 border-cyan-400/30">
              <div>
                <p className="text-cyan-300">
                  Welcome, {user.name || user.email}
                </p>
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="bg-blue-800 hover:bg-blue-700 px-4 py-2 rounded text-cyan-300 border border-cyan-500/30"
                >
                  Settings
                </button>
                <button
                  onClick={handleSignOut}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded shadow-lg shadow-red-500/30"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="bg-blue-900/50 p-6 rounded-lg border-2 border-cyan-400/30 space-y-4">
              <input
                type="number"
                value={screenTime}
                onChange={(e) => setScreenTime(Number(e.target.value))}
                placeholder="Enter screen time (minutes)"
                className="w-full md:w-auto bg-blue-800/50 px-4 py-2 rounded border border-cyan-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none"
              />
              <button
                onClick={submitScreenTime}
                className="w-full md:w-auto bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 px-6 py-2 rounded shadow-lg shadow-green-500/30 ml-0 md:ml-4 mt-2 md:mt-0"
              >
                Submit
              </button>
            </div>

            <div className="bg-blue-900/50 p-6 rounded-lg border-2 border-cyan-400/30">
              <h2 className="text-2xl font-bold mb-6 text-center text-yellow-400">
                HIGH SCORES
              </h2>
              <div className="space-y-2">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between p-4 rounded ${
                      index % 2 === 0 ? "bg-blue-800/30" : "bg-blue-900/30"
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <span className="text-xl font-bold text-yellow-400 w-8">
                        {index + 1}
                      </span>
                      <span className="text-lg text-cyan-300">
                        {entry.name}
                      </span>
                    </div>
                    <span className="text-lg text-yellow-400">
                      {entry.screenTime}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentName={user?.name || ""}
          onSave={handleUpdateSettings}
        />
      </div>
    </div>
  );
}
