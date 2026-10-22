import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Mascot } from "../src/components/Mascot";

function Demo() {
  const [size, setSize] = useState(132);

  useEffect(() => {
    const host = document.getElementById("bubo-demo");
    if (!host) return;
    const update = () => {
      const width = host.getBoundingClientRect().width;
      setSize(Math.max(88, Math.min(160, Math.round(width || 132))));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <Mascot
      state="idle"
      mood="idle"
      size={size}
      shape="round"
      color="#8b7dff"
      showMouth={false}
      mouthStyle="line"
      mouthSize="medium"
      mouthColor="auto"
      eyeStyle="bars"
      eyeSize="large"
      eyeSpacing="normal"
      eyeTilt="straight"
      eyeColor="auto"
      boopable
    />
  );
}

const host = document.getElementById("bubo-demo");
if (host) createRoot(host).render(<Demo />);
