import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const Home: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const newId = uuidv4();
    navigate(`/canvas/${newId}`);
  }, [navigate]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <p className="text-lg text-gray-700">Redirecting to new canvas...</p>
    </div>
  );
};

export default Home;
