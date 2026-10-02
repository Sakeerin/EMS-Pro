import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiCopy, FiKey } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './TempPasswordModal.css';

// Shows a generated temporary password once. Only the Done button closes it,
// so a stray backdrop click or Escape can't lose the password. Rendered into
// <body> so animated page containers can't affect its fixed positioning.
const TempPasswordModal = ({ email, password, onClose }) => {
    // While open, warn before reload/close and swallow browser Back, so the
    // password can't disappear without Done
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        // An extra entry for the current URL: Back pops it and stays on this page
        const keepPage = () => window.history.pushState(window.history.state, '', window.location.href);

        keepPage();
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', keepPage);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', keepPage);
        };
    }, []);

    const handleCopy = () => {
        // navigator.clipboard is missing on plain-HTTP origins other than localhost
        if (!navigator.clipboard) {
            toast.error('Could not copy. Select the password and copy it manually.');
            return;
        }
        navigator.clipboard.writeText(password)
            .then(() => toast.success('Password copied to clipboard!'))
            .catch(() => toast.error('Could not copy. Select the password and copy it manually.'));
    };

    return createPortal(
        <div className="modal-overlay">
            <div className="modal temp-password-modal" role="dialog" aria-modal="true" aria-labelledby="temp-password-title">
                <div className="modal-header">
                    <h2 id="temp-password-title" className="modal-title">
                        <FiKey /> Temporary password
                    </h2>
                </div>
                <div className="modal-body">
                    <p>
                        Give this password to <strong>{email}</strong>. They will be asked to
                        choose a new one the first time they sign in.
                    </p>
                    <div className="temp-password-box">
                        <code>{password}</code>
                        {/* Focus moves here so Enter copies instead of re-submitting the form behind */}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy} autoFocus>
                            <FiCopy /> Copy
                        </button>
                    </div>
                    <p className="temp-password-warning">This password will not be shown again.</p>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-primary" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TempPasswordModal;
