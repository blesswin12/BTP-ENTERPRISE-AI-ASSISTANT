for app in $(cf apps | awk 'NR>1 {print $1}'); do
  echo "Starting app: $app"
  cf start "$app"
done