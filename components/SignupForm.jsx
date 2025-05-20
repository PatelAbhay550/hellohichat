"use client";

import React, { useState } from "react";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaImage,
  FaSpinner,
} from "react-icons/fa";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import {
  setDoc,
  doc,
  serverTimestamp,
  getDoc,
  collection,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const SignupFormComponent = () => {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    profileImage: null,
  });

  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "profileImage") {
      const file = files[0];
      setFormData((prev) => ({ ...prev, profileImage: file }));
      setImagePreview(URL.createObjectURL(file));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const convertImageToWebP = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => resolve(blob),
            "image/webp",
            0.8
          );
        };
      };
    });
  };

  const isUsernameTaken = async (username) => {
    const docRef = doc(db, "usernames", username.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const { name, username, email, password, confirmPassword, profileImage } =
      formData;

    if (!name.trim()) return setError("Name is required.");
    if (!username.trim()) return setError("Username is required.");
    if (password !== confirmPassword)
      return setError("Passwords do not match!");

    try {
      setUploading(true);

      const taken = await isUsernameTaken(username);
      if (taken) {
        setUploading(false);
        return setError("Username already taken.");
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      await sendEmailVerification(user);

      let profileImageUrl = "";
      if (profileImage) {
        const webpImage = await convertImageToWebP(profileImage);
        const storageRef = ref(
          storage,
          `hellohi-users/${user.uid}/profile.webp`
        );
        await uploadBytes(storageRef, webpImage);
        profileImageUrl = await getDownloadURL(storageRef);
      }

      const userData = {
        uid: user.uid,
        name,
        username: username.toLowerCase(),
        email,
        profileImageUrl,
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isadmin: false,
        bio: "",
        website: "",
        location: "",
        phone: "",
        socialLinks: {
          facebook: "",
          twitter: "",
          instagram: "",
          linkedin: "",
        },
        friends: [],
        notifications: [],
      };

      // Save main user doc
      await setDoc(doc(db, "hellohi-users", user.uid), userData);

      // Save username for fast lookup
      await setDoc(doc(db, "usernames", username.toLowerCase()), {
        uid: user.uid,
      });

      // Sign out so user can verify email first
      await signOut(auth);

      alert("Account created! Please verify your email before logging in.");
      router.push("/"); // redirect to homepage
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md p-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
        <h2 className="text-3xl font-bold text-center text-gray-800 dark:text-white">
          Create Account
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Name */}
          <InputField
            icon={<FaUser />}
            name="name"
            placeholder="Full Name"
            value={formData.name}
            onChange={handleChange}
          />

          {/* Username */}
          <InputField
            icon={<FaUser />}
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
          />

          {/* Email */}
          <InputField
            icon={<FaEnvelope />}
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            type="email"
          />

          {/* Password */}
          <InputField
            icon={<FaLock />}
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            type="password"
          />

          {/* Confirm Password */}
          <InputField
            icon={<FaLock />}
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            type="password"
          />

          {/* Image upload */}
          <div>
            <label className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 cursor-pointer">
              <FaImage className="text-gray-500 dark:text-gray-400 mr-3" />
              <input
                type="file"
                name="profileImage"
                accept="image/*"
                onChange={handleChange}
                className="hidden"
              />
              <span className="text-gray-800 dark:text-gray-200">
                Upload Profile Image
              </span>
            </label>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                className="mt-2 w-20 h-20 rounded-full object-cover"
              />
            )}
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {uploading ? (
              <>
                <FaSpinner className="animate-spin mr-2" /> Creating account...
              </>
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        <p className="mt-4 text-sm text-center text-gray-600 dark:text-gray-300">
          Already have an account?{" "}
          <Link
            href="/log-in"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

const InputField = ({ icon, ...props }) => (
  <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2">
    <span className="text-gray-500 dark:text-gray-400 mr-3">{icon}</span>
    <input
      {...props}
      autoComplete="off"
      required
      className="w-full bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none"
    />
  </div>
);

export default SignupFormComponent;
