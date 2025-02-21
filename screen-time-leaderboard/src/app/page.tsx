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
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import Image from "next/image";

interface User {
  id: string;
  name: string;
  email: string;
  weeklyTime: number;
  totalTime: number;
  isAdmin?: boolean;
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

  // Add state for sorting
  const [sortBy, setSortBy] = useState<"weekly" | "total">("weekly");

  useEffect(() => {
    let leaderboardUnsubscribe: () => void = () => {};

    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        try {
          leaderboardUnsubscribe();

          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          const userData = userDoc.data();

          setUser({
            ...authUser,
            name: userData?.name || authUser.displayName || "Anonymous",
            isAdmin: userData?.isAdmin || false,
          });

          // Get current week ID
          const now = new Date();
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - ((now.getDay() + 1) % 7));
          startOfWeek.setHours(0, 0, 0, 0);
          const weekId = startOfWeek.toISOString().split("T")[0];

          // Set up leaderboard listener based on sort type
          const setupLeaderboardListener = () => {
            let q;
            if (sortBy === "weekly") {
              q = query(
                collection(db, "screenTime"),
                where("weekStart", "==", startOfWeek),
                orderBy("weeklyTime", "asc")
              );
            } else {
              q = query(collection(db, "users"), orderBy("totalTime", "asc"));
            }

            return onSnapshot(
              q,
              (snapshot) => {
                const users = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                })) as User[];
                setLeaderboard(users);
              },
              (error) => {
                if (error.code === "failed-precondition") {
                  console.log("Please wait while the index is being built...");
                } else {
                  console.error("Leaderboard listener error:", error);
                }
              }
            );
          };

          leaderboardUnsubscribe = setupLeaderboardListener();
        } catch (error) {
          console.error("Error setting up listeners:", error);
        }
      } else {
        leaderboardUnsubscribe();
        setUser(null);
        setLeaderboard([]);
      }
    });

    return () => {
      leaderboardUnsubscribe();
      unsubscribe();
    };
  }, [sortBy]); // Add sortBy to dependencies

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

      // Get the current week's document ID (based on the start of the week - Saturday)
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - ((now.getDay() + 1) % 7)); // Set to last Saturday
      startOfWeek.setHours(0, 0, 0, 0);
      const weekId = startOfWeek.toISOString().split("T")[0];

      // Get or create weekly document
      const weeklyDocRef = doc(db, "screenTime", `${user.uid}_${weekId}`);
      const weeklyDoc = await getDoc(weeklyDocRef);
      const currentWeeklyTime = weeklyDoc.exists()
        ? weeklyDoc.data().weeklyTime
        : 0;

      // Update weekly time
      await setDoc(weeklyDocRef, {
        userId: user.uid,
        name: userData?.name || user.name || user.displayName || "Anonymous",
        email: user.email,
        weeklyTime: currentWeeklyTime + screenTime,
        timestamp: new Date(),
        weekStart: startOfWeek,
      });

      // Update total time in user document
      const currentTotalTime = userData?.totalTime || 0;
      await updateDoc(doc(db, "users", user.uid), {
        totalTime: currentTotalTime + screenTime,
      });

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

  // Add admin reset function
  const handleResetLeaderboard = async () => {
    if (!user?.isAdmin) return;

    try {
      // Get all screenTime documents
      const screenTimeSnapshot = await getDocs(collection(db, "screenTime"));
      const batch = writeBatch(db);

      // Delete all screenTime documents
      screenTimeSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Reset all users' totalTime to 0
      const usersSnapshot = await getDocs(collection(db, "users"));
      usersSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { totalTime: 0 });
      });

      await batch.commit();
      console.log("Leaderboard reset successfully");
    } catch (error) {
      console.error("Error resetting leaderboard:", error);
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
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-yellow-400">
                  HIGH SCORES
                </h2>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setSortBy("weekly")}
                    className={`px-4 py-2 rounded ${
                      sortBy === "weekly"
                        ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                        : "bg-blue-800 text-cyan-300"
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setSortBy("total")}
                    className={`px-4 py-2 rounded ${
                      sortBy === "total"
                        ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                        : "bg-blue-800 text-cyan-300"
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>
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
                      {sortBy === "weekly" ? entry.weeklyTime : entry.totalTime}{" "}
                      minutes
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {user?.isAdmin && (
              <div className="mt-8 bg-red-900/50 p-6 rounded-lg border-2 border-red-400/30">
                <h2 className="text-xl font-bold text-red-400 mb-4">
                  Admin Panel
                </h2>
                <button
                  onClick={handleResetLeaderboard}
                  className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded shadow-lg shadow-red-500/30 text-white font-bold"
                >
                  Reset Leaderboard
                </button>
              </div>
            )}
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
