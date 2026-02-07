require 'sinatra'
require 'json'

before do
  content_type :json
end

post '/parents' do
  { message: "Parent created", id: 1 }.to_json
end

post '/parents/:parentId/teens' do
  { message: "Teen created under parent #{params['parentId']}", teen_id: 1 }.to_json
end

post '/teens/:teenId/channels' do
  data = JSON.parse(request.body.read) rescue {}
  { message: "Allowlist updated for teen #{params['teenId']}", channels: data['channels'] || [] }.to_json
end

get '/teens/:teenId/channels' do
  { teenId: params['teenId'], channels: [] }.to_json
end

get '/health' do
  { status: 'ok' }.to_json
end

post '/auth/youtube' do
  { auth_url: 'https://example.com/auth/youtube' }.to_json
end

get '/auth/youtube/callback' do
  { token: 'mock-token' }.to_json
end

get '/teens/:teenId/accessible-videos' do
  { teenId: params['teenId'], videos: [] }.to_json
end

run! if __FILE__ == $0
