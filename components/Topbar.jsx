"use client";

import React from "react";
import { FaSearch } from "react-icons/fa";
import {  BsPersonFillExclamation } from "react-icons/bs";
import Link from "next/link";

const Topbar = () => {
  return (
    <div className="w-full bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
      {/* App Name */}
      <div className="text-xl font-bold">HelloHi Chat 👋</div>

      {/* Icons */}
      <div className="flex items-center gap-4 text-lg">
        <Link href="/search">
        <button title="search users" className="hover:opacity-80 transition cursor-pointer">
          <FaSearch />
        </button>
        </Link>
        <Link href='/profile'>
        <button className="hover:opacity-80 transition cursor-pointer" title="Profile">
          <BsPersonFillExclamation />
        </button></Link>
      </div>
    </div>
  );
};

export default Topbar;
