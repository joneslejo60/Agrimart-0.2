import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  StatusBar, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Image, 
  FlatList,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { RootStackParamList, HomeTabsParamList } from '../navigation/navigation.types';
import { getCartItems, saveCartItems, CartItem } from '../utils/cartStorage';
import { cartApi, CartItemUpdateDto, productsApi, } from '../services/apiService';
import userService from '../services/userService';
import { useLanguage } from '../context/LanguageContext';

type AgriInputScreenRouteProp = RouteProp<RootStackParamList, 'AgriInputScreen'>;
type AgriInputScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList, 'AgriInputScreen'>,
  BottomTabNavigationProp<HomeTabsParamList>
>;
interface Product {
  id: string;
  name: string;
  price: number;
  image: any;
  description?: string;
  productId?: string; // Added for backend product ID
}

interface AgriCartItem extends CartItem {
  productId?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const itemWidth = (screenWidth - 45) / 2; // 45 = padding + gap

const AgriInputScreen = () => {
  const { translate } = useLanguage();
  const route = useRoute<AgriInputScreenRouteProp>();
  const navigation = useNavigation<AgriInputScreenNavigationProp>();
  const { userName = '', userPhone = '' } = route.params || {};
  
  const [searchText, setSearchText] = useState('');
  const [cartItems, setCartItems] = useState<AgriCartItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  
  // Load cart items from storage when component mounts or when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const loadCartItems = async () => {
        setLoading(true);
        try {
          // First load cart items from storage for a quick UI update
          const storedCartItems = await getCartItems();
          setCartItems(storedCartItems);
          
          // Then fetch products
          const productItems = await getProducts();
          
          // Use products from API
          console.log('Using products from API, count:', productItems.length);
          setProducts(productItems);
        } catch (error) {
          console.error('Error loading data:', error);
          // If there's an error, show empty state
          console.log('Error occurred, showing empty state');
          setProducts([]);
        } finally {
          setLoading(false);
        }
      };
      
      loadCartItems();
    }, [])
  );


   const getProducts = async (): Promise<any[]> => {
    try {
      console.log('Fetching products using productsApi');
      
      // Use the productsApi to get products
      const response = await productsApi.getAll(1,50);
      
      if (!response.success || !response.data) {
        throw new Error(`Failed to fetch products: ${response.error || 'Unknown error'}`);
      }
      
      const data = response.data;
      console.log('AgriInput API Response:', JSON.stringify(data).substring(0, 200)); // Log first part of response
      
      if (!Array.isArray(data)) {
        console.error('API did not return an array of products');
        return [];
      }
      
      // Check if the array is empty
      if (data.length === 0) {
        console.log('API returned an empty array of products');
        return [];
      }
      
      // Map the data to our product format
      const mappedProducts = data.map((item: any) => {
        console.log('AgriInput processing item image:', item.imageUrl); // Log each image URL
        return {
          id: item.productId || `product-${Math.random().toString(36).substring(2, 9)}`,
          name: item.name || 'Product',
          price: item.price || 0,
          // Handle image URL or fallback to a default image
          image: item.imageUrl ? { uri: item.imageUrl } : require('../../assets/logo.png'),
          description: item.description || '',
          productId: item.productId // Ensure productId is mapped
        };
      });
      
      // Check if we have valid products after mapping
      if (mappedProducts.length === 0) {
        console.log('No valid products after mapping');
        return [];
      }
      
      return mappedProducts;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
   }

  // Filter products based on search text
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const getCartItemQuantity = (productId: string): number => {
    const item = cartItems.find(item => (item.productId || item.id) === productId);
    return item ? item.quantity : 0;
  };

  const addToCart = async (product: Product) => {
    try {
      const currentCart = await getCartItems();
      const productIdForApi = product.productId || product.id;
      if (!productIdForApi || productIdForApi === '00000000-0000-0000-0000-000000000000') {
        console.error('AgriInput - Invalid product ID, cannot add to cart');
        return;
      }
      const existingItem = currentCart.find((item: AgriCartItem) => (item.productId || item.id) === productIdForApi);
      let updatedCart: AgriCartItem[];
      let response;
      if (existingItem) {
        const newQuantity = existingItem.quantity + 1;
        updatedCart = currentCart.map((item: AgriCartItem) =>
          (item.productId || item.id) === productIdForApi
            ? { ...item, quantity: newQuantity }
            : item
        );
        response = await cartApi.updateQuantity(productIdForApi, newQuantity);
      } else {
        updatedCart = [...currentCart, { ...product, quantity: 1, productId: productIdForApi }];
        response = await cartApi.updateQuantity(productIdForApi, 1);
      }
      await saveCartItems(updatedCart);
      setCartItems(updatedCart);
      if (response && !response.success) {
        console.error('AgriInput - API Error with cart operation:', response.error);
      } else {
        console.log('AgriInput - Successfully performed cart operation via API');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  const removeFromCart = async (productId: string) => {
    try {
      const currentCart = await getCartItems();
      const existingItem = currentCart.find((item: AgriCartItem) => (item.productId || item.id) === productId);
      if (!existingItem) {
        console.error('Item not found in cart');
        return;
      }
      let updatedCart: AgriCartItem[];
      let response;
      if (existingItem.quantity > 1) {
        const newQuantity = existingItem.quantity - 1;
        updatedCart = currentCart.map((item: AgriCartItem) =>
          (item.productId || item.id) === productId
            ? { ...item, quantity: newQuantity }
            : item
        );
        response = await cartApi.updateQuantity(productId, newQuantity);
      } else {
        updatedCart = currentCart.filter((item: AgriCartItem) => (item.productId || item.id) !== productId);
        response = await cartApi.removeItem(productId);
      }
      await saveCartItems(updatedCart);
      setCartItems(updatedCart);
      if (response && !response.success) {
        console.error('AgriInput - API Error removing item:', response.error);
      } else {
        console.log('AgriInput - Successfully removed item via API');
      }
    } catch (error) {
      console.error('Error removing from cart:', error);
    }
  };

  const navigateToCart = async () => {
    // Get the latest cart items from storage
    const storedCartItems = await getCartItems();
    
    navigation.reset({
      index: 0,
      routes: [{ 
        name: 'HomeTabs', 
        params: { userName, userPhone },
        state: {
          routes: [{ name: 'Cart', params: { userName, userPhone, cartItems: storedCartItems } }],
          index: 0,
        }
      }],
    });
  };

  const renderProductItem = ({ item }: { item: Product }) => {
    const quantity = getCartItemQuantity(item.id);
    
    return (
      <View style={styles.productCard}>
        <Image source={item.image} style={styles.productImage} resizeMode="cover" />
        <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.productPrice}>₹{item.price.toFixed(2)}</Text>
        
        {quantity === 0 ? (
          <TouchableOpacity 
            style={styles.addToCartButton} 
            onPress={() => addToCart({ ...item, productId: item.productId || item.id })}
          >
            <Text style={styles.addToCartText}>{translate('Add to Cart')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.quantityContainer}>
            <TouchableOpacity 
              style={styles.quantityButton} 
              onPress={() => removeFromCart(item.productId || item.id)}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity.toString().padStart(2, '0')}</Text>
            <TouchableOpacity 
              style={styles.quantityButton} 
              onPress={() => addToCart({ ...item, productId: item.productId || item.id })}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <StatusBar backgroundColor="#09A84E" barStyle="light-content" translucent={false} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-left" size={20} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AgriInputs</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Icon name="search" size={16} color="gray" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search agriinputs"
              placeholderTextColor="gray"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
        </View>

        {/* Products Grid */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#09A84E" />
            <Text style={styles.loadingText}>{translate('Loading products...')}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.productsContainer}
            columnWrapperStyle={styles.productRow}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{translate('No products found')}</Text>
              </View>
            }
          />
        )}

        {/* Bottom Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity 
            style={styles.tabButton}
            activeOpacity={0.6}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ 
                  name: 'HomeTabs', 
                  params: { userName, userPhone },
                  state: {
                    routes: [{ name: 'Home', params: { userName, userPhone } }],
                    index: 0,
                  }
                }],
              });
            }}
          >
            <Ionicons name="home-outline" size={24} color="gray" />
            <Text style={styles.tabLabel}>{translate('Home')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.tabButton}
            activeOpacity={0.6}
            onPress={async () => {
              // Get the latest cart items from storage
              const storedCartItems = await getCartItems();
              
              navigation.reset({
                index: 0,
                routes: [{ 
                  name: 'HomeTabs', 
                  params: { userName, userPhone },
                  state: {
                    routes: [{ name: 'Cart', params: { userName, userPhone, cartItems: storedCartItems } }],
                    index: 0,
                  }
                }],
              });
            }}
          >
            <Ionicons name="cart-outline" size={24} color="gray" />
            <Text style={styles.tabLabel}>{translate('Cart')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.tabButton}
            activeOpacity={0.6}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ 
                  name: 'HomeTabs', 
                  params: { userName, userPhone },
                  state: {
                    routes: [{ name: 'Profile', params: { userName, userPhone } }],
                    index: 0,
                  }
                }],
              });
            }}
          >
            <Ionicons name="person-outline" size={24} color="gray" />
            <Text style={styles.tabLabel}>{translate('Profile')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', // Changed from center to flex-end to move content down
    backgroundColor: '#09A84E', 
    paddingHorizontal: 15,
    paddingTop: 45, // Increased top padding to move content down
    paddingBottom: 10,
    height: 88,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  backButton: {
    padding: 5,
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 10,
  },
  searchContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: '#f8f8f8',
    marginTop: 88, // Added to account for absolute positioned header
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#09A84E',
    paddingHorizontal: 15,
    paddingVertical: 6,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: 'gray',
  },
  productsContainer: {
    padding: 15,
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: itemWidth,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    justifyContent: 'space-between',
    minHeight: 250,
    overflow: 'hidden', // Ensure children don't overflow
    paddingBottom: 0, // Remove bottom padding to allow button to be flush
  },
  productImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  productName: {
    fontFamily: 'Montserrat',
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
    minHeight: 35, // Ensure consistent height
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 10,
  },
  addToCartButton: {
    backgroundColor: '#09A84E',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 0, // Remove border radius at the bottom
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    marginTop: 'auto', // Push to bottom
    marginLeft: -10, // Extend beyond the card's left padding
    marginRight: -10, // Extend beyond the card's right padding
    marginBottom: 0, // Ensure no bottom margin
    width: itemWidth, // Match the width of the card
  },
  addToCartText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
     fontFamily: 'Montserrat',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09A84E',
    borderRadius: 0, // Remove border radius at the bottom
    paddingVertical: 8,
    paddingHorizontal: 5,
    height: 46,
    marginTop: 'auto', // Push to bottom
    marginLeft: -10, // Extend beyond the card's left padding
    marginRight: -10, // Extend beyond the card's right padding
    marginBottom: 0, // Ensure no bottom margin
    width: itemWidth, // Match the width of the card
  },
  quantityButton: {
    backgroundColor: 'transparent',
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
     fontFamily: 'Montserrat',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginHorizontal: 15,
    minWidth: 25,
    textAlign: 'center',
     fontFamily: 'Montserrat',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 5,
    paddingTop: 5,
    height: 60,
    borderTopWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabLabel: {
    fontSize: 12,
    color: 'gray',
    marginTop: 2,
     fontFamily: 'Montserrat',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#09A84E',
     fontFamily: 'Montserrat',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: 300,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 10,
     fontFamily: 'Montserrat',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
     fontFamily: 'Montserrat',
  },
});

export default AgriInputScreen;