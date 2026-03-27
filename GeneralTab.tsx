import React, { useEffect, useState } from 'react';
import { useStore } from '<store_location>';

const GeneralTab = () => {
    const { groqApiKey, geminiApiKey } = useStore();
    const [localGroqApiKey, setLocalGroqApiKey] = useState(groqApiKey);
    const [localGeminiApiKey, setLocalGeminiApiKey] = useState(geminiApiKey);

    useEffect(() => {
        setLocalGroqApiKey(groqApiKey);
        setLocalGeminiApiKey(geminiApiKey);
    }, [groqApiKey, geminiApiKey]);

    // ... rest of your component 

};

export default GeneralTab;