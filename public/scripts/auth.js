// Authentication related functionality
class AuthManager {
    constructor() {
        this.checkUrlParams();
    }

    // Check URL for authentication errors
    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        
        if (error) {
            let message = 'Произошла ошибка при авторизации';
            
            switch (error) {
                case 'auth_failed':
                    message = 'Не удалось авторизоваться через Epic Games';
                    break;
                case 'access_denied':
                    message = 'Доступ запрещен. Проверьте права доступа';
                    break;
                case 'banned':
                    message = 'Ваш аккаунт заблокирован';
                    break;
                default:
                    message = `Ошибка: ${error}`;
            }
            
            gamePlatform.showToast(message, 'error');
            
            // Clean URL without reloading
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }

    // Handle Epic Games OAuth flow
    async initiateEpicLogin() {
        try {
            gamePlatform.showLoading('Перенаправление на Epic Games...');
            
            // Optional: Store current page to redirect back after auth
            sessionStorage.setItem('pre_auth_url', window.location.pathname);
            
            // Redirect to Epic OAuth
            window.location.href = '/auth/epic';
        } catch (error) {
            console.error('Epic login initiation failed:', error);
            gamePlatform.showToast('Ошибка при инициации авторизации', 'error');
            gamePlatform.hideLoading();
        }
    }

    // Handle post-authentication redirect
    handleAuthSuccess() {
        const preAuthUrl = sessionStorage.getItem('pre_auth_url');
        sessionStorage.removeItem('pre_auth_url');
        
        if (preAuthUrl && preAuthUrl !== '/') {
            window.location.href = preAuthUrl;
        } else {
            window.location.href = '/dashboard';
        }
    }

    // Logout functionality
    async logout() {
        try {
            gamePlatform.showLoading('Выход из системы...');
            
            const response = await fetch('/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                gamePlatform.showToast('Вы успешно вышли из системы', 'success');
                
                // Clear any stored data
                this.clearStoredData();
                
                // Redirect after a short delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Logout error:', error);
            gamePlatform.showToast('Ошибка при выходе из системы', 'error');
        } finally {
            gamePlatform.hideLoading();
        }
    }

    // Clear any stored authentication data
    clearStoredData() {
        // Clear session storage
        sessionStorage.removeItem('pre_auth_url');
        sessionStorage.removeItem('user_data');
        
        // Clear any cached user data
        if (window.gamePlatform) {
            window.gamePlatform.user = null;
        }
    }

    // Check if user needs to complete profile
    async checkProfileCompletion() {
        try {
            const response = await gamePlatform.apiRequest('/api/user/profile');
            const user = response;
            
            // Check if user has completed basic profile requirements
            if (!user.nickname || user.nickname.startsWith('User_')) {
                this.showProfileCompletionModal();
            }
            
            return user;
        } catch (error) {
            console.error('Profile check failed:', error);
            return null;
        }
    }

    // Show profile completion modal
    showProfileCompletionModal() {
        const modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Завершите настройку профиля</h2>
                </div>
                <div class="modal-body">
                    <p>Для полноценного использования платформы, пожалуйста, укажите дополнительную информацию:</p>
                    <form id="profileForm" class="form">
                        <div class="form-group">
                            <label class="form-label" for="nickname">Никнейм *</label>
                            <input type="text" id="nickname" name="nickname" class="form-input" required
                                   placeholder="Введите ваш игровой никнейм" maxlength="50">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="favoriteGame">Любимая игра (необязательно)</label>
                            <input type="text" id="favoriteGame" name="favoriteGame" class="form-input"
                                   placeholder="Например: Fortnite, CS:GO, Valorant" maxlength="100">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" onclick="authManager.saveProfile()">
                        Сохранить и продолжить
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    }

    // Save profile information
    async saveProfile() {
        try {
            const form = document.getElementById('profileForm');
            const formData = new FormData(form);
            
            // Validate form
            const nickname = formData.get('nickname').trim();
            if (!nickname) {
                gamePlatform.showToast('Пожалуйста, введите никнейм', 'error');
                return;
            }
            
            if (nickname.length < 2) {
                gamePlatform.showToast('Никнейм должен содержать минимум 2 символа', 'error');
                return;
            }
            
            gamePlatform.showLoading('Сохранение профиля...');
            
            const response = await gamePlatform.apiRequest('/api/user/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    nickname: nickname,
                    favoriteGame: formData.get('favoriteGame').trim()
                })
            });
            
            gamePlatform.showToast('Профиль успешно обновлен!', 'success');
            gamePlatform.closeModal('profileModal');
            
            // Update user data
            if (window.gamePlatform) {
                window.gamePlatform.user = { ...window.gamePlatform.user, ...response };
                window.gamePlatform.updateUI();
            }
            
        } catch (error) {
            console.error('Profile