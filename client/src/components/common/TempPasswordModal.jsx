import { createPortal } from 'react-dom';
import { FiCopy, FiKey } from 'react-icons/fi';
import toast from 'react-hot-toast';
import './TempPasswordModal.css';

// Shows a generated temporary password once. Only the Done button closes it,
// so a stray backdrop click or Escape can't lose the password. Rendered into
// <body> so animated page containers can't affect its fixed positioning.
const TempPasswordModal = ({ email, password, onClose }) => {
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
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
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
