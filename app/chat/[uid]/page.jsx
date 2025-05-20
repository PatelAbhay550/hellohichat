"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import { IoIosArrowRoundBack } from "react-icons/io";
import Link from 'next/link'
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,

} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { FaPaperPlane, FaImage, FaTimesCircle, FaRegTimesCircle } from "react-icons/fa"; // Added FaTimesCircle for image removal
import { BsBack } from "react-icons/bs";

const ChatWithUser = () => {
  const { uid: receiverUid } = useParams();
  const currentUser = auth.currentUser;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null); // State for image preview
  const messagesEndRef = useRef(null);
  const [receiverData, setReceiverData] = useState(null);
useEffect(() => {
  const fetchReceiverData = async () => {
    if (!receiverUid) return;

    const docRef = doc(db, "hellohi-users", receiverUid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      setReceiverData(docSnap.data());
    }
  };

  fetchReceiverData();
}, [receiverUid]);


  useEffect(() => {
    if (!currentUser || !receiverUid) return;

    const messagesRef = collection(db, "hellohi-messages");
    const q = query(
      messagesRef,
      where("participants", "array-contains", currentUser.uid),
      orderBy("timestamp")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const filtered = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (msg) =>
            (msg.sender === currentUser.uid && msg.receiver === receiverUid) ||
            (msg.sender === receiverUid && msg.receiver === currentUser.uid)
        );

      setMessages(filtered);
    });

    return () => unsub();
  }, [receiverUid, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file)); // Create URL for preview
    } else {
      setImage(null);
      setImagePreview(null);
    }
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
  };

  const handleSend = async () => {
    if (!text.trim() && !image) return;

    let imageUrl = null;
    if (image) {
      const imgRef = ref(storage, `chat-images/${uuidv4()}.webp`);
      const compressedImage = await compressImage(image);
      await uploadBytes(imgRef, compressedImage);
      imageUrl = await getDownloadURL(imgRef);
    }

    await addDoc(collection(db, "hellohi-messages"), {
      text,
      image: imageUrl,
      sender: currentUser.uid,
      receiver: receiverUid,
      participants: [currentUser.uid, receiverUid],
      timestamp: serverTimestamp(),
    });
// 🔁 Update chattedWith for sender
  const senderRef = doc(db, "hellohi-users", currentUser.uid);
  await updateDoc(senderRef, {
    chattedWith: arrayUnion(receiverUid),
  });

  // 🔁 Update chattedWith for receiver
  const receiverRef = doc(db, "hellohi-users", receiverUid);
  await updateDoc(receiverRef, {
    chattedWith: arrayUnion(currentUser.uid),
  });
    setText("");
    setImage(null);
    setImagePreview(null); // Clear preview after sending
  };

  const compressImage = async (file) => {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\..+$/, ".webp"), { type: "image/webp" })),
        "image/webp",
        0.7
      );
    });
  };

  return (
    <div className="max-w-2xl mx-auto h-screen flex flex-col bg-gray-50 dark:bg-gray-900 shadow-lg rounded-lg overflow-hidden">
        <div className="topbar bg-blue-600 text-white p-4 flex items-center gap-3">
          <Link href="/">
          <IoIosArrowRoundBack className="text-3xl font-bold cursor-pointer" /></Link>
  {receiverData?.profileImageUrl ? (
   
    <img
      src={receiverData.profileImageUrl}
      alt={receiverData.name || "User"}
      className="w-10 h-10 rounded-full object-cover"
    />
    
  ) : (
    <div className="w-10 h-10 rounded-full bg-white text-blue-600 flex items-center justify-center font-bold">
      {receiverData?.name?.[0] || "U"}
    </div>
  )}
  <h2 className="text-lg font-semibold">
    {receiverData?.name || "Loading..."}
  </h2>
</div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === currentUser.uid ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`p-3 rounded-2xl max-w-[75%] shadow-md break-words ${
                msg.sender === currentUser.uid
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-bl-none"
              }`}
            >
              {msg.image && (
                <img
                  src={msg.image}
                  alt="shared content"
                  className="w-full h-auto max-h-64 object-cover rounded-lg mb-2 cursor-pointer transition-transform duration-200 hover:scale-105"
                  loading="lazy"
                  onClick={() => window.open(msg.image, "_blank")} // Open image in new tab on click
                />
              )}
              {msg.text && <p className="text-sm">{msg.text}</p>}
              {msg.timestamp && (
                <span className={`text-xs mt-1 block ${
                  msg.sender === currentUser.uid ? "text-blue-200" : "text-gray-500 dark:text-gray-400"
                }`}>
                  {new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 bg-white dark:bg-gray-800">
        {imagePreview && (
          <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
            <button
              onClick={removeImage}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 text-xs hover:bg-red-600 transition-colors"
              aria-label="Remove image"
            >
              <FaTimesCircle />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
          />

          <label className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
            <FaImage className="w-7 h-7" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>

          <button
            onClick={handleSend}
            className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!text.trim() && !image}
            aria-label="Send message"
          >
            <FaPaperPlane className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWithUser;