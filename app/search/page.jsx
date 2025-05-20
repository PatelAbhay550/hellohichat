"use client";

import React, { useState, useEffect, useRef } from "react";
import { collection, query, getDocs, orderBy, startAt, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

const Search = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const usersRef = collection(db, "hellohi-users");
        const qUsername = query(usersRef, orderBy("username"), startAt(searchTerm), limit(10));
        const usernameSnap = await getDocs(qUsername);

        const matchedUsers = [];
        usernameSnap.forEach((doc) => {
          const data = doc.data();
          if (
            data.username.toLowerCase().startsWith(searchTerm.toLowerCase()) ||
            data.name.toLowerCase().startsWith(searchTerm.toLowerCase())
          ) {
            matchedUsers.push(data);
          }
        });

        setResults(matchedUsers);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchTerm]);

  const goToChat = (receiverUid) => {
    router.push(`/chat/${receiverUid}`);
  };

  return (
    <div className="max-w-lg mx-auto mt-10 p-6 bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl border border-blue-100 dark:border-gray-700 transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <svg className="w-7 h-7 text-blue-500 dark:text-blue-400 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search users by username or name"
          className="flex-1 px-5 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-7 w-7 text-blue-600 dark:text-blue-400 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-gray-600 dark:text-gray-400 text-lg font-medium">Searching for users...</span>
        </div>
      )}

      {!loading && results.length === 0 && searchTerm.trim() && (
        <div className="flex flex-col items-center justify-center py-8">
          <svg className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-3 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15s1.5-2 4-2 4 2 4 2" />
            <path d="M9 9h.01M15 9h.01" />
          </svg>
          <span className="text-gray-500 dark:text-gray-400 text-base">No users found matching your search. Try a different name!</span>
        </div>
      )}

      <ul className="mt-2 space-y-4">
        {results.map((user) => (
          <li
            key={user.uid}
            onClick={() => goToChat(user.uid)}
            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer border border-gray-100 dark:border-gray-700"
          >
            <img
              src={user.profileImageUrl || "/default-profile.webp"}
              alt={`${user.name}'s profile`}
              className="w-16 h-16 rounded-full object-cover border-3 border-blue-300 dark:border-blue-500 shadow-lg"
              loading="lazy"
            />
            <div>
              <p className="font-extrabold text-xl text-blue-700 dark:text-blue-300 truncate">{user.username}</p>
              <p className="text-md text-gray-600 dark:text-gray-400 truncate">{user.name}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Search;
