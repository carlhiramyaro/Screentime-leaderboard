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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-96">
        <h2 className="text-xl font-bold mb-4">Settings</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-gray-700 px-4 py-2 rounded"
              required
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
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
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Screen Time Leaderboard</h1>

        {!user ? (
          <div className="space-y-8">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setIsRegistering(false)}
                className={`px-4 py-2 rounded ${
                  !isRegistering ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setIsRegistering(true)}
                className={`px-4 py-2 rounded ${
                  isRegistering ? "bg-blue-600" : "bg-gray-700"
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
                  className="w-full bg-gray-800 px-4 py-2 rounded"
                  required
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-gray-800 px-4 py-2 rounded"
                required
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-gray-800 px-4 py-2 rounded"
                required
              />
              {error && <p className="text-red-500">{error}</p>}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded"
              >
                {isRegistering ? "Register" : "Login"}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <p>Welcome, {user.name || user.email}</p>
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
                >
                  Settings
                </button>
                <button
                  onClick={handleSignOut}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <input
                type="number"
                value={screenTime}
                onChange={(e) => setScreenTime(Number(e.target.value))}
                placeholder="Enter screen time (minutes)"
                className="bg-gray-800 px-4 py-2 rounded"
              />
              <button
                onClick={submitScreenTime}
                className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded ml-4"
              >
                Submit
              </button>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Leaderboard</h2>
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center bg-gray-800 p-4 rounded"
                >
                  <div className="flex items-center flex-1">
                    <span className="font-bold text-xl w-8">{index + 1}</span>
                    <span className="text-lg flex-1">{entry.name}</span>
                  </div>
                  <span className="text-lg">{entry.screenTime} minutes</span>
                </div>
              ))}
            </div>

            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              currentName={user.name || ""}
              onSave={handleUpdateSettings}
            />
          </div>
        )}
      </div>
    </div>
  );
}
