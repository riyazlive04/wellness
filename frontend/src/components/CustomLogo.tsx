
import React from 'react';

interface CustomLogoProps {
    className?: string;
}

export const CustomLogo: React.FC<CustomLogoProps> = ({ className }) => {
    return (
        <div className={className}>
            <img
                src="/logo.png"
                alt="Sheizen Logo"
                className="w-full h-full object-contain"
            />
        </div>
    );
};
