"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { FaSpinner } from "react-icons/fa";

const SigninForm = () => {
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const router = useRouter();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleResetPassword = async () => {
    if (!resetEmail) return setError("Enter email to reset password.");
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      alert("Password reset link sent to your email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const { username, password } = formData;

    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);

    try {
      // Get UID from usernames collection
      const unameRef = doc(db, "usernames", username.toLowerCase());
      const unameSnap = await getDoc(unameRef);

      if (!unameSnap.exists()) {
        setError("Username does not exist.");
        setLoading(false);
        return;
      }

      const uid = unameSnap.data().uid;

      // Get user doc from hellohi-users
      const userDoc = await getDoc(doc(db, "hellohi-users", uid));
      const userData = userDoc.data();
      const email = userData.email;

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        setError("Please verify your email before signing in.");
        setLoading(false);
        return;
      }

      // If not already marked in DB, set emailVerified: true
      if (!userData.emailVerified) {
        await updateDoc(doc(db, "hellohi-users", uid), {
          emailVerified: true,
        });
      }

      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md p-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
        <h2 className="text-3xl font-bold text-center text-gray-800 dark:text-white">
          Sign In
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Username"
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none"
              required
            />
          </div>

          <div>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Password"
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin mr-2" /> Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-4 text-sm text-center text-gray-600 dark:text-gray-300">
          Forgot your password?{" "}
          <button
            onClick={() => setShowReset(!showReset)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Reset here
          </button>
        </div>

        {showReset && (
          <div className="mt-4 space-y-3">
            <input
              type="email"
              placeholder="Enter your email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none"
            />
            <button
              onClick={handleResetPassword}
              className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Send Reset Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SigninForm;
