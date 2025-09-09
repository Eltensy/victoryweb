// Main JavaScript functionality
class GamePlatform {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        await this.checkAuthStatus();
        this.setupEventListeners();
        this.updateUI();
    }

    // Authentication
    async checkAuthStatus() {
        try {
            const response = await fetch('/auth/status');
            const data = await response.json();
            
            if (data.isAuthenticated) {
                this.user = data.user;
            }
        } catch (error) {
            console.error('Auth status check failed:', error);
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Loading overlay
        document.addEventListener('DOMContentLoaded', () => {
            this.hideLoading();
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Toast auto-hide
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('toast')) {
                this.hideToast();
            }
        });

        // Modal close on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Form validation
        document.querySelectorAll('.form-input, .form-textarea, .form-select').forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
        });
    }

    // UI Updates
    updateUI() {
        const navAuth = document.getElementById('navAuth');
        const loginButton = document.getElementById('loginButton');

        if (this.user && navAuth) {
            navAuth.innerHTML = `
                <div class="user-info">
                    <span>Привет, ${this.user.nickname}!</span>
                    <a href="/dashboard" class="glass-button">Панель</a>
                    <button onclick="gamePlatform.logout()" class="glass-button">Выйти</button>
                </div>
            `;
        }

        if (this.user && loginButton) {
            loginButton.href = '/dashboard';
            loginButton.innerHTML = '<span>🎮 Перейти в панель</span>';
        }
    }

    // Authentication methods
    async logout() {
        try {
            this.showLoading('Выход из системы...');
            
            const response = await fetch('/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                this.user = null;
                this.showToast('Вы успешно вышли из системы', 'success');
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Ошибка при выходе из системы', 'error');
        } finally {
            this.hideLoading();
        }
    }

    // Loading overlay
    showLoading(message = 'Загрузка...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = overlay?.querySelector('p');
        
        if (overlay) {
            if (messageEl) messageEl.textContent = message;
            overlay.classList.remove('hidden');
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    // Toast notifications
    showToast(message, type = 'error') {
        const toast = document.getElementById('errorToast');
        const messageEl = toast?.querySelector('.toast-message');
        
        if (toast && messageEl) {
            // Update classes
            toast.className = `toast toast-${type}`;
            
            // Update message
            messageEl.textContent = message;
            
            // Show toast
            toast.classList.remove('hidden');
            
            // Auto hide after 5 seconds
            setTimeout(() => {
                this.hideToast();
            }, 5000);
        }
    }

    hideToast() {
        const toast = document.getElementById('errorToast');
        if (toast) {
            toast.classList.add('hidden');
        }
    }

    // Modal management
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }

    // Form validation
    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.name || field.id;
        let errorMessage = '';

        // Remove existing error
        this.clearFieldError(field);

        // Required field validation
        if (field.hasAttribute('required') && !value) {
            errorMessage = 'Это поле обязательно для заполнения';
        }

        // Email validation
        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                errorMessage = 'Введите корректный email адрес';
            }
        }

        // File validation
        if (field.type === 'file' && field.files.length > 0) {
            const file = field.files[0];
            const maxSize = 100 * 1024 * 1024; // 100MB
            
            if (file.size > maxSize) {
                errorMessage = 'Размер файла не должен превышать 100MB';
            }
        }

        // Show error if exists
        if (errorMessage) {
            this.showFieldError(field, errorMessage);
            return false;
        }

        return true;
    }

    showFieldError(field, message) {
        field.classList.add('error');
        
        let errorEl = field.parentNode.querySelector('.form-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'form-error';
            field.parentNode.appendChild(errorEl);
        }
        
        errorEl.textContent = message;
    }

    clearFieldError(field) {
        field.classList.remove('error');
        const errorEl = field.parentNode.querySelector('.form-error');
        if (errorEl) {
            errorEl.remove();
        }
    }

    // Utility methods
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // API helper methods
    async apiRequest(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return response;
        } catch (error) {
            console.error(`API request failed: ${url}`, error);
            throw error;
        }
    }

    // Animation helpers
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        let start = performance.now();
        
        const animate = (timestamp) => {
            const elapsed = timestamp - start;
            const progress = elapsed / duration;
            
            if (progress < 1) {
                element.style.opacity = progress;
                requestAnimationFrame(animate);
            } else {
                element.style.opacity = '1';
            }
        };
        
        requestAnimationFrame(animate);
    }

    fadeOut(element, duration = 300) {
        let start = performance.now();
        const startOpacity = parseFloat(window.getComputedStyle(element).opacity);
        
        const animate = (timestamp) => {
            const elapsed = timestamp - start;
            const progress = elapsed / duration;
            
            if (progress < 1) {
                element.style.opacity = startOpacity * (1 - progress);
                requestAnimationFrame(animate);
            } else {
                element.style.opacity = '0';
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Intersection Observer for animations
    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.feature-card, .rule-item').forEach(el => {
            observer.observe(el);
        });
    }
}

// Initialize the application
const gamePlatform = new GamePlatform();

// Setup scroll animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    gamePlatform.setupScrollAnimations();
});

// Export for global use
window.gamePlatform = gamePlatform;