"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FaSpinner, FaSearch, FaUserCircle } from "react-icons/fa";
import Topbar from "./Topbar";

const Homepage = () => {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState(null);
  const [chatUsers, setChatUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/sign-up");
        return;
      }

      try {
        const userRef = doc(db, "hellohi-users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserInfo(data);

          if (data.chattedWith?.length) {
            const users = await Promise.all(
              data.chattedWith.map(async (uid) => {
                const ref = doc(db, "hellohi-users", uid);
                const snap = await getDoc(ref);
                return snap.exists() ? { uid, ...snap.data() } : null;
              })
            );

            setChatUsers(users.filter(Boolean));
          }
        } else {
          setUserInfo({ email: user.email, username: "Unknown" });
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-blue-600 text-xl">
        <FaSpinner className="animate-spin mr-2" /> Loading...
      </div>
    );
  }

  return (
    <>
      <Topbar />
      <div className="min-h-screen p-6 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white">
        <div className="mb-6 text-xl font-semibold">
          Welcome, {userInfo?.username} ({userInfo?.email})
        </div>

        {chatUsers.length ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Chats</h3>
            {chatUsers.map((u) => (
              <div
                key={u.uid}
                className="flex items-center gap-4 p-3 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer"
                onClick={() => router.push(`/chat/${u.uid}`)}
              >
                {u.profileImageUrl ? (
                  <img
                    src={u.profileImageUrl}
                    alt={u.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <FaUserCircle className="w-10 h-10 text-gray-400" />
                )}
                <span className="text-base font-medium">{u.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center mt-20 text-center text-gray-600 dark:text-gray-400">
            <FaSearch className="text-6xl mb-4 text-blue-600" />
            <p className="text-lg font-medium">No recent chats</p>
            <p className="text-sm mt-1">Click the search icon in the top bar to start a new chat!</p>
          </div>
        )}
      </div>
    </>
  );
};

export default Homepage;
