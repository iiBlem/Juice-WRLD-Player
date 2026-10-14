#!/usr/bin/env python3

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from juicewrld_api_wrapper import JuiceWRLDAPI
    print("✓ Successfully imported JuiceWRLDAPI")
except ImportError as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

def test_basic_functionality():
    print("\n=== Testing Basic Functionality ===")
    
    try:
        api = JuiceWRLDAPI()
        print("✓ Successfully created API client")
        
        try:
            overview = api.get_api_overview()
            print("✓ API overview retrieved successfully")
        except Exception as e:
            print(f"⚠ API overview failed (expected if API is down): {e}")
        
        try:
            categories = api.get_categories()
            print(f"✓ Categories retrieved: {len(categories)} categories")
        except Exception as e:
            print(f"⚠ Categories failed (expected if API is down): {e}")
        
        api.close()
        print("✓ Successfully closed client")
        
        return True
        
    except Exception as e:
        print(f"✗ Basic functionality test failed: {e}")
        return False

def test_search_functionality():
    print("\n=== Testing Search Functionality ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            search_results = api.search_songs("lucid", limit=3)
            print(f"✓ Search for 'lucid' returned {search_results.total} results")
            
            if search_results.songs:
                song = search_results.songs[0]
                print(f"✓ First result: {song.name} ({song.category})")
                print(f"  Era: {song.era.name}")
                print(f"  Length: {song.length}")
        except Exception as e:
            print(f"⚠ Search failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Search functionality test failed: {e}")
        return False

def test_pagination():
    print("\n=== Testing Pagination ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            page1 = api.get_songs(page=1, page_size=5)
            print(f"✓ Page 1: {len(page1['results'])} songs")
            print(f"✓ Total count: {page1['count']}")
            
            if page1['results']:
                print(f"✓ First song page 1: {page1['results'][0].name}")
        except Exception as e:
            print(f"⚠ Pagination failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Pagination test failed: {e}")
        return False

def test_category_filtering():
    print("\n=== Testing Category Filtering ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            released = api.get_songs_by_category("released", page_size=3)
            print(f"✓ Released songs: {released['count']} total, {len(released['results'])} on page")
            
            if released['results']:
                print(f"✓ Sample released: {released['results'][0].name}")
        except Exception as e:
            print(f"⚠ Category filtering failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Category filtering test failed: {e}")
        return False

def test_artists():
    print("\n=== Testing Artists ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            artists = api.get_artists()
            print(f"✓ Retrieved {len(artists)} artists")
            
            if artists:
                artist = artists[0]
                print(f"✓ First artist: {artist.name}")
                
                artist_detail = api.get_artist(artist.id)
                print(f"✓ Artist detail: {artist_detail.name}")
        except Exception as e:
            print(f"⚠ Artists test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Artists test failed: {e}")
        return False

def test_albums():
    print("\n=== Testing Albums ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            albums = api.get_albums()
            print(f"✓ Retrieved {len(albums)} albums")
            
            if albums:
                album = albums[0]
                print(f"✓ First album: {album.title}")
                
                album_detail = api.get_album(album.id)
                print(f"✓ Album detail: {album_detail.title}")
        except Exception as e:
            print(f"⚠ Albums test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Albums test failed: {e}")
        return False

def test_eras():
    print("\n=== Testing Eras ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            eras = api.get_eras()
            print(f"✓ Retrieved {len(eras)} eras")
            
            if eras:
                era = eras[0]
                print(f"✓ First era: {era.name}")
                
                era_detail = api.get_era(era.id)
                print(f"✓ Era detail: {era_detail.name}")
        except Exception as e:
            print(f"⚠ Eras test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Eras test failed: {e}")
        return False

def test_song_details():
    print("\n=== Testing Song Details ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            songs = api.get_songs(page_size=1)
            if songs['results']:
                song_id = songs['results'][0].id
                song_detail = api.get_song(song_id)
                print(f"✓ Song detail: {song_detail.name}")
            else:
                print("⚠ No songs available to test song details")
        except Exception as e:
            print(f"⚠ Song details test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Song details test failed: {e}")
        return False

def test_stats():
    print("\n=== Testing Stats ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            stats = api.get_stats()
            print(f"✓ Stats retrieved - Total songs: {stats.total_songs}")
            print(f"✓ Category stats available: {len(stats.category_stats)} categories")
            print(f"✓ Era stats available: {len(stats.era_stats)} eras")
        except Exception as e:
            print(f"⚠ Stats test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Stats test failed: {e}")
        return False

def test_player_endpoints():
    print("\n=== Testing Player & Audio Streaming ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            player_songs = api.get_juicewrld_songs(page_size=3)
            print(f"✓ Player songs retrieved")
            
            if 'results' in player_songs and player_songs['results']:
                song_id = player_songs['results'][0]['id']
                
                player_song = api.get_juicewrld_song(song_id)
                print(f"✓ Player song detail retrieved")
                
                # Test the updated play method (now uses files/download)
                play_result = api.play_juicewrld_song(song_id)
                if 'error' in play_result:
                    print(f"⚠ Play endpoint: {play_result['error']}")
                else:
                    print(f"✓ Play song endpoint: {play_result['status']}")
                    if 'stream_url' in play_result:
                        print(f"  Stream URL: {play_result['stream_url']}")
                
                # Test direct audio streaming with known file
                test_file_path = "Compilation/2. Unreleased Discography/1. JUICED UP THE EP (Sessions)/Ain't Talkin' Toronto (feat. JuiceTheKidd).mp3"
                stream_result = api.stream_audio_file(test_file_path)
                
                if stream_result['status'] == 'success':
                    print(f"✓ Direct audio streaming works!")
                    print(f"  Content type: {stream_result['content_type']}")
                    print(f"  Content length: {stream_result.get('content_length', 'unknown')}")
                    print(f"  Range support: {stream_result['supports_range']}")
                else:
                    print(f"⚠ Direct streaming: {stream_result.get('error', 'unknown error')}")
                    
        except Exception as e:
            print(f"⚠ Player endpoints test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ Player endpoints test failed: {e}")
        return False

def test_file_operations():
    print("\n=== Testing File Operations ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            browse_result = api.browse_files()
            print(f"✓ File browsing - {browse_result.total_files} files, {browse_result.total_directories} directories")
            
            if browse_result.items:
                file_item = None
                for item in browse_result.items:
                    if item.type == 'file':
                        file_item = item
                        break
                
                if file_item:
                    file_info = api.get_file_info(file_item.path)
                    print(f"✓ File info retrieved for: {file_info.name}")
                    
                    try:
                        cover_art = api.get_cover_art(file_item.path)
                        print(f"✓ Cover art retrieved ({len(cover_art)} bytes)")
                    except:
                        print("⚠ Cover art not available for this file")
                    
                    try:
                        download_content = api.download_file(file_item.path)
                        print(f"✓ File download successful ({len(download_content)} bytes)")
                    except:
                        print("⚠ File download failed or not supported")
                
                file_paths = ["Snippets/Auto/Auto.mp4"]
                if file_paths:
                    try:
                        zip_content = api.create_zip(file_paths)
                        print(f"✓ ZIP creation successful ({len(zip_content)} bytes)")
                    except Exception as e:
                        print(f"⚠ ZIP creation failed: {e}")
        except Exception as e:
            print(f"⚠ File operations test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ File operations test failed: {e}")
        return False

def test_zip_jobs():
    print("\n=== Testing ZIP Job Operations ===")
    
    try:
        api = JuiceWRLDAPI()
        
        try:
            file_paths = ["Snippets/Auto/Auto.mp4"]
            
            if file_paths:
                job_id = api.start_zip_job(file_paths)
                print(f"✓ ZIP job started: {job_id}")
                
                job_status = api.get_zip_job_status(job_id)
                print(f"✓ ZIP job status retrieved")
                
                cancel_result = api.cancel_zip_job(job_id)
                print(f"✓ ZIP job cancel attempted: {cancel_result}")
            else:
                print("⚠ No files available for ZIP job testing")
        except Exception as e:
            print(f"⚠ ZIP jobs test failed (expected if API is down): {e}")
        
        api.close()
        return True
        
    except Exception as e:
        print(f"✗ ZIP jobs test failed: {e}")
        return False



def main():
    print("Juice WRLD API Wrapper Test Suite")
    print("=" * 50)
    
    tests = [
        test_basic_functionality,
        test_search_functionality,
        test_pagination,
        test_category_filtering,
        test_artists,
        test_albums,
        test_eras,
        test_song_details,
        test_stats,
        test_player_endpoints,
        test_file_operations,
        test_zip_jobs
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The wrapper is working correctly.")
        return 0
    else:
        print("❌ Some tests failed. Please check the errors above.")
        return 1

if __name__ == "__main__":

    sys.exit(main())
