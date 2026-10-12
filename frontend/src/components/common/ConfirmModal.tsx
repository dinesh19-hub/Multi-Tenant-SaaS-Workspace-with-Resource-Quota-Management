import React from 'react';
import { IconAlertTriangle, IconTrash, IconInfoCircle } from '@tabler/icons-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmText,
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const actionText = confirmText || confirmLabel || 'Confirm';

  const getIcon = () => {
    if (confirmVariant === 'danger') {
      return (
        <div className="modal-status-icon bg-danger-subtle text-danger rounded-circle p-2 d-inline-flex mb-2">
          <IconTrash size={24} stroke={2} />
        </div>
      );
    }
    if (confirmVariant === 'warning') {
      return (
        <div className="modal-status-icon bg-warning-subtle text-warning rounded-circle p-2 d-inline-flex mb-2">
          <IconAlertTriangle size={24} stroke={2} />
        </div>
      );
    }
    return (
      <div className="modal-status-icon bg-primary-subtle text-primary rounded-circle p-2 d-inline-flex mb-2">
        <IconInfoCircle size={24} stroke={2} />
      </div>
    );
  };

  return (
    <>
      <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-sm" role="document">
          <div className="modal-content shadow border-0 text-center p-3">
            <div className="modal-header border-0 pb-0 justify-content-end p-0">
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                disabled={isLoading}
                onClick={onCancel}
              />
            </div>
            <div className="modal-body p-2 pt-0">
              {getIcon()}
              <h5 className="modal-title fw-bold text-dark mb-2">{title}</h5>
              <p className="mb-0 text-secondary small">{message}</p>
            </div>
            <div className="modal-footer border-0 pt-3 justify-content-center gap-2 p-0">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-3"
                disabled={isLoading}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`btn btn-${confirmVariant} btn-sm px-3 d-flex align-items-center gap-2`}
                disabled={isLoading}
                onClick={onConfirm}
              >
                {isLoading && (
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                )}
                {actionText}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
};
