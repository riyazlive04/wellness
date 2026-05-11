import React from "react";

const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="w-full py-6 px-4 md:px-8 bg-gradient-to-br from-wellness-mint/10 to-wellness-light border-t border-wellness-mint/20">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1 font-medium">
                    <span>&copy; {currentYear} Sheizen Wellness. All rights reserved.</span>
                </div>
                <div className="flex items-center gap-1 font-medium">
                    <span>Powered by</span>
                    <a
                        href="https://sirahdigital.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-wellness-green hover:underline transition-all"
                    >
                        Sirah Digital
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
