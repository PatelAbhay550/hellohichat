"use client";

import React, { useEffect, useRef, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";
import { useRouter } from "next/navigation";
import { FaCamera, FaEdit } from "react-icons/fa";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/sign-up");
        return;
      }

      const userRef = doc(db, "hellohi-users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        setUser({ uid: firebaseUser.uid, ...userData });
        setName(userData.name);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    const storageRef = ref(storage, `profile-pictures/${user.uid}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    const userRef = doc(db, "hellohi-users", user.uid);
    await updateDoc(userRef, {
      profilePicture: downloadURL,
    });

    setUser((prev) => ({ ...prev, profilePicture: downloadURL }));
  };

  const handleSaveName = async () => {
    if (!user || name.trim() === "") return;
    setSaving(true);

    const userRef = doc(db, "hellohi-users", user.uid);
    await updateDoc(userRef, {
      username: name.trim(),
    });

    setUser((prev) => ({ ...prev, username: name.trim() }));
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-blue-600 text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6 text-gray-900 dark:text-white">
      <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        {/* go to home link */}
        
        <h2 className="text-2xl font-bold mb-6 text-center">My Profile</h2>
        <Link href="/">
            <button className="cursor-pointer bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700">
                Back To Home
            </button>
        </Link> 

        <div className="flex justify-center mb-4 relative">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt="Profile"
              className="w-24 h-24 rounded-full object-cover border-4 border-blue-500"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gray-300 flex items-center justify-center text-3xl text-white border-4 border-blue-500">
              {user.username?.[0]?.toUpperCase() || "U"}
            </div>
          )}

          <button
            className="absolute bottom-1 right-1 bg-blue-600 p-2 rounded-full text-white hover:bg-blue-700"
            onClick={() => fileInputRef.current.click()}
          >
            <FaCamera />
          </button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-1 font-medium">Full Name</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 outline-none"
            />
            <button
              onClick={handleSaveName}
              className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              <FaEdit />
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-sm mb-1 font-medium">Username</label>
          <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">{user.username}</div>
        </div>

        <div className="mb-2">
          <label className="block text-sm mb-1 font-medium">Email</label>
          <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">{user.email}</div>
        </div>
      </div>
    </div>
  );
}
