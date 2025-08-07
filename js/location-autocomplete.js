// Location Autocomplete Module for Google Places API integration

class LocationAutocomplete {
    constructor(inputElement) {
        this.input = inputElement;
        this.dropdown = null;
        this.selectedPlace = null;
        this.debounceTimer = null;
        this.isLoading = false;
        
        this.init();
    }
    
    init() {
        // Create dropdown container
        this.createDropdown();
        
        // Add event listeners
        this.input.addEventListener('input', (e) => this.handleInput(e));
        this.input.addEventListener('focus', () => this.showDropdown());
        this.input.addEventListener('blur', (e) => this.handleBlur(e));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Add clear functionality when input is cleared
        this.input.addEventListener('input', (e) => {
            if (!e.target.value) {
                this.selectedPlace = null;
                this.hideDropdown();
            }
        });
    }
    
    createDropdown() {
        // Create dropdown element
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'location-autocomplete-dropdown';
        this.dropdown.style.display = 'none';
        
        // Position dropdown relative to input
        const inputRect = this.input.getBoundingClientRect();
        const inputParent = this.input.parentElement;
        inputParent.style.position = 'relative';
        inputParent.appendChild(this.dropdown);
    }
    
    handleInput(e) {
        const query = e.target.value.trim();
        
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Hide dropdown if query is too short
        if (query.length < 2) {
            this.hideDropdown();
            return;
        }
        
        // Debounce the search
        this.debounceTimer = setTimeout(() => {
            this.searchPlaces(query);
        }, 300);
    }
    
    async searchPlaces(query) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Call the Firebase function
            const getPlaceSuggestions = firebase.functions().httpsCallable('getPlaceSuggestions');
            const result = await getPlaceSuggestions({ query });
            
            if (result.data.success && result.data.suggestions.length > 0) {
                this.displaySuggestions(result.data.suggestions);
            } else {
                this.showNoResults();
            }
        } catch (error) {
            console.error('Error fetching place suggestions:', error);
            this.showError();
        } finally {
            this.isLoading = false;
        }
    }
    
    displaySuggestions(suggestions) {
        // Clear dropdown
        this.dropdown.innerHTML = '';
        
        // Create suggestion items
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = 'location-autocomplete-item';
            item.dataset.placeId = suggestion.placeId;
            item.dataset.index = index;
            
            // Create formatted display
            item.innerHTML = `
                <div class="location-main">${this.escapeHtml(suggestion.mainText)}</div>
                ${suggestion.secondaryText ? `<div class="location-secondary">${this.escapeHtml(suggestion.secondaryText)}</div>` : ''}
            `;
            
            // Add click handler
            item.addEventListener('click', () => this.selectPlace(suggestion));
            
            this.dropdown.appendChild(item);
        });
        
        this.showDropdown();
    }
    
    async selectPlace(suggestion) {
        // Set the input value to the full description
        this.input.value = suggestion.description;
        
        // Store the selected place
        this.selectedPlace = {
            placeId: suggestion.placeId,
            description: suggestion.description,
            mainText: suggestion.mainText,
            secondaryText: suggestion.secondaryText
        };
        
        // Hide dropdown
        this.hideDropdown();
        
        // Optionally fetch place details for more information
        try {
            const getPlaceDetails = firebase.functions().httpsCallable('getPlaceDetails');
            const result = await getPlaceDetails({ placeId: suggestion.placeId });
            
            if (result.data.success) {
                this.selectedPlace = {
                    ...this.selectedPlace,
                    ...result.data.place
                };
                
                // Update input with formatted address
                this.input.value = result.data.place.address || suggestion.description;
                
                // Trigger change event
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (error) {
            console.error('Error fetching place details:', error);
            // Still use the basic suggestion data
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    handleKeydown(e) {
        if (!this.dropdown || this.dropdown.style.display === 'none') return;
        
        const items = this.dropdown.querySelectorAll('.location-autocomplete-item');
        const activeItem = this.dropdown.querySelector('.location-autocomplete-item.active');
        let currentIndex = activeItem ? parseInt(activeItem.dataset.index) : -1;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                this.setActiveItem(currentIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                this.setActiveItem(currentIndex);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (activeItem) {
                    activeItem.click();
                }
                break;
                
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }
    
    setActiveItem(index) {
        const items = this.dropdown.querySelectorAll('.location-autocomplete-item');
        items.forEach(item => item.classList.remove('active'));
        
        if (items[index]) {
            items[index].classList.add('active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }
    
    handleBlur(e) {
        // Delay hiding to allow click events to fire
        setTimeout(() => {
            if (!this.dropdown.contains(document.activeElement)) {
                this.hideDropdown();
            }
        }, 200);
    }
    
    showDropdown() {
        this.dropdown.style.display = 'block';
    }
    
    hideDropdown() {
        this.dropdown.style.display = 'none';
    }
    
    showLoading() {
        this.dropdown.innerHTML = `
            <div class="location-autocomplete-loading">
                <span class="loading-spinner"></span>
                Searching locations...
            </div>
        `;
        this.showDropdown();
    }
    
    showNoResults() {
        this.dropdown.innerHTML = `
            <div class="location-autocomplete-no-results">
                No locations found
            </div>
        `;
        this.showDropdown();
    }
    
    showError() {
        this.dropdown.innerHTML = `
            <div class="location-autocomplete-error">
                Error loading suggestions
            </div>
        `;
        this.showDropdown();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Get the selected place data
    getSelectedPlace() {
        return this.selectedPlace;
    }
    
    // Clear the selection
    clear() {
        this.input.value = '';
        this.selectedPlace = null;
        this.hideDropdown();
    }
    
    // Set initial value (for editing)
    setValue(value) {
        this.input.value = value;
        // Note: This doesn't set selectedPlace as we don't have the place data
        // The location will be treated as plain text unless user selects from autocomplete
    }
}

// Export for use in other modules
window.LocationAutocomplete = LocationAutocomplete;
