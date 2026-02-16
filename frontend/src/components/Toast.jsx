import React, { useEffect } from 'react';
import './Toast.css';

const Toast = ({ message, type = 'info', onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000); // Hilang otomatis setelah 3 detik

        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`toast-item ${type}`}>
            <div className="toast-icon">
                {type === 'success' && '✓'}
                {type === 'error' && '!'}
                {type === 'info' && 'i'}
            </div>
            <span className="toast-message">{message}</span>
        </div>
    );
};

export default Toast;